// Automated linter for @kidthales/tol-palettes:
// 1. Validates all 22 scheme JSON files against schema/scheme.schema.json + invariants
// 2. Runs `node --check` syntax validation on all tools/*.mjs and tests/*.mjs
// 3. Verifies Paul Tol attribution headers across all generated files in dist/
// 4. Verifies zero tracked agent/scratch files in git
// 5. Verifies package.json subpath exports resolve on disk
// 6. Audits GitHub Actions workflows against AST drift and security invariants
// 7. Audits dist/gallery/index.html for CSP compliance, anchors, and accessible controls

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll } from './validate.mjs';
import { auditWorkflows } from './check-workflows.mjs';
import { semverToPep440, DOC_FILES, DOC_LINK_REGEX } from './sync-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// 1. JSON Schema + Invariant validation
const results = validateAll();
if (results.length !== 22) {
  errors.push(`Expected 22 scheme files in data/schemes/, found ${results.length}.`);
}
for (const r of results) {
  for (const p of r.problems) {
    errors.push(`[schema] ${r.file}: ${p}`);
  }
}

// 2. Node.js syntax check on all tools/*.mjs and tests/*.mjs
for (const dirName of ['tools', 'tests']) {
  const dirPath = join(root, dirName);
  for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.mjs'))) {
    const fullPath = join(dirPath, file);
    try {
      execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`[syntax] ${dirName}/${file}: ${err.stderr?.toString() || err.message}`);
    }
  }
}

// 3. Attribution header check across dist/ outputs
const distCheckDirs = ['css', 'js', 'py', 'godot', 'gpl', 'aseprite', 'gallery', 'json'];
for (const sub of distCheckDirs) {
  const subPath = join(root, 'dist', sub);
  if (!existsSync(subPath)) {
    errors.push(`[dist] Missing dist/${sub} directory.`);
    continue;
  }
  const files = readdirSync(subPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  if (files.length === 0) {
    errors.push(`[dist] dist/${sub} is empty.`);
  }
  for (const f of files) {
    if (sub === 'gallery' && f === 'CNAME') {
      continue;
    }
    const content = readFileSync(join(subPath, f), 'utf8');
    if (!content.includes('Paul Tol') || !content.includes('not affiliated with or endorsed by Paul Tol')) {
      errors.push(`[attribution] dist/${sub}/${f} is missing the mandatory Paul Tol attribution header.`);
    }
  }
}

// 4. Agent / scratch file leak guard
try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const badPattern = /^(\.agents?\/|\.gemini\/|\.ai\/|\.cursor\/|\.claude\/|scratch\/|docs\/learnings\/|AGENTS\.md$|GEMINI\.md$|CLAUDE\.md$)/;
  for (const file of tracked) {
    if (badPattern.test(file)) {
      errors.push(`[hygiene] Agent or scratch file tracked in git: ${file}`);
    }
  }
} catch {
  // Ignore if git is unavailable
}

// 5. Package exports resolution check
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
  const targets = typeof target === 'string' ? [target] : Object.values(target);
  for (const t of targets) {
    const checkPath = t.includes('*') ? t.replace(/\/?\*.*$/, '') : t;
    if (!existsSync(join(root, checkPath))) {
      errors.push(`[exports] Export "${subpath}" target "${t}" does not exist on disk.`);
    }
  }
}

// 6. GitHub Actions workflow AST & security audit
const workflowViolations = auditWorkflows(root);
for (const v of workflowViolations) {
  errors.push(`[workflow] ${v}`);
}

// 7. Gallery HTML accessibility, anchors, and CSP audit
const galleryHtmlPath = join(root, 'dist', 'gallery', 'index.html');
if (existsSync(galleryHtmlPath)) {
  const html = readFileSync(galleryHtmlPath, 'utf8');

  // Reject inline <script> tags (all scripts must be external for script-src 'self')
  const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = inlineScriptRegex.exec(html)) !== null) {
    if (scriptMatch[1].trim().length > 0) {
      errors.push('[gallery] Inline <script> tag detected in dist/gallery/index.html (CSP script-src \'self\' violation).');
    }
  }

  // Reject inline on* event handlers
  const inlineEventRegex = /\s(on[a-z]+)\s*=\s*["'][^"']*["']/gi;
  let eventMatch;
  while ((eventMatch = inlineEventRegex.exec(html)) !== null) {
    errors.push(`[gallery] Inline event handler "${eventMatch[1]}" detected in dist/gallery/index.html (CSP violation).`);
  }

  // Reject broken #scheme-* anchors
  const anchorRegex = /href="#(scheme-[a-z0-9-]+)"/gi;
  let anchorMatch;
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const targetId = anchorMatch[1];
    if (!html.includes(`id="${targetId}"`)) {
      errors.push(`[gallery] Broken anchor href="#${targetId}" (no matching element with id="${targetId}").`);
    }
  }

  // Reject unlabeled controls (<button>, <input>, <select>, <textarea>)
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let buttonMatch;
  while ((buttonMatch = buttonRegex.exec(html)) !== null) {
    const attrs = buttonMatch[1];
    const inner = buttonMatch[2].replace(/<[^>]+>/g, '').trim();
    const hasAriaLabel = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    const hasAriaLabelledby = /\baria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs);
    if (!hasAriaLabel && !hasAriaLabelledby && inner.length === 0) {
      errors.push(`[gallery] Unlabeled <button> control detected: ${buttonMatch[0].slice(0, 80)}`);
    }
  }

  const inputRegex = /<input\b([^>]*)>/gi;
  let inputMatch;
  while ((inputMatch = inputRegex.exec(html)) !== null) {
    const attrs = inputMatch[1];
    const isHidden = /\btype\s*=\s*["']hidden["']/i.test(attrs);
    if (!isHidden) {
      const hasAriaLabel = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs);
      const hasAriaLabelledby = /\baria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs);
      if (!hasAriaLabel && !hasAriaLabelledby) {
        errors.push(`[gallery] Unlabeled <input> control detected: ${inputMatch[0]}`);
      }
    }
  }
}

// 8. 8-target version parity verification
let expectedPep440;
try {
  expectedPep440 = semverToPep440(pkg.version);
} catch (err) {
  errors.push(`[version] package.json version "${pkg.version}" is not valid SemVer: ${err.message}`);
}

if (expectedPep440) {
  // Target 2: package-lock.json
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    errors.push('[version] Missing package-lock.json');
  } else {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (lock.version !== pkg.version) {
        errors.push(`[version] package-lock.json version "${lock.version}" does not match package.json "${pkg.version}"`);
      }
      if (lock.packages && lock.packages[''] && lock.packages[''].version !== pkg.version) {
        errors.push(
          `[version] package-lock.json packages[""].version "${lock.packages[''].version}" does not match package.json "${pkg.version}"`,
        );
      }
    } catch (err) {
      errors.push(`[version] Failed to parse package-lock.json: ${err.message}`);
    }
  }

  // Target 3: pyproject.toml
  const pyTomlPath = join(root, 'pyproject.toml');
  if (!existsSync(pyTomlPath)) {
    errors.push('[version] Missing pyproject.toml');
  } else {
    const pyToml = readFileSync(pyTomlPath, 'utf8');
    const pyMatch = pyToml.match(/^version\s*=\s*["']([^"']+)["']/m);
    if (!pyMatch) {
      errors.push('[version] pyproject.toml missing version field');
    } else if (pyMatch[1] !== expectedPep440) {
      errors.push(`[version] pyproject.toml version "${pyMatch[1]}" does not match expected PEP 440 "${expectedPep440}"`);
    }
  }

  // Target 4: CITATION.cff
  const cffPath = join(root, 'CITATION.cff');
  if (!existsSync(cffPath)) {
    errors.push('[version] Missing CITATION.cff');
  } else {
    const cff = readFileSync(cffPath, 'utf8');
    const cffMatch = cff.match(/^version:\s*([^\s\r\n]+)/m);
    if (!cffMatch) {
      errors.push('[version] CITATION.cff missing version field');
    } else if (cffMatch[1] !== pkg.version) {
      errors.push(`[version] CITATION.cff version "${cffMatch[1]}" does not match package.json "${pkg.version}"`);
    }
  }

  // Target 5: dist/godot/addons/tol_palettes/plugin.cfg
  const pluginCfgPath = join(root, 'dist', 'godot', 'addons', 'tol_palettes', 'plugin.cfg');
  if (!existsSync(pluginCfgPath)) {
    errors.push('[version] Missing dist/godot/addons/tol_palettes/plugin.cfg');
  } else {
    const pluginCfg = readFileSync(pluginCfgPath, 'utf8');
    const pluginMatch = pluginCfg.match(/^version\s*=\s*"([^"]+)"/m);
    if (!pluginMatch) {
      errors.push('[version] plugin.cfg missing version field');
    } else if (pluginMatch[1] !== pkg.version) {
      errors.push(`[version] plugin.cfg version "${pluginMatch[1]}" does not match package.json "${pkg.version}"`);
    }
  }

  // Target 6: dist/py/tol_palettes.py
  const pyDistPath = join(root, 'dist', 'py', 'tol_palettes.py');
  if (!existsSync(pyDistPath)) {
    errors.push('[version] Missing dist/py/tol_palettes.py');
  } else {
    const pyDist = readFileSync(pyDistPath, 'utf8');
    const pyDistMatch = pyDist.match(/^__version__\s*=\s*['"]([^'"]+)['"]/m);
    if (!pyDistMatch) {
      errors.push('[version] dist/py/tol_palettes.py missing __version__ declaration');
    } else if (pyDistMatch[1] !== expectedPep440) {
      errors.push(
        `[version] dist/py/tol_palettes.py __version__ "${pyDistMatch[1]}" does not match expected PEP 440 "${expectedPep440}"`,
      );
    }
  }

  // Target 7: dist/sri.json
  const sriPath = join(root, 'dist', 'sri.json');
  if (!existsSync(sriPath)) {
    errors.push('[version] Missing dist/sri.json');
  } else {
    try {
      const sriObj = JSON.parse(readFileSync(sriPath, 'utf8'));
      if (sriObj.version !== pkg.version) {
        errors.push(`[version] dist/sri.json version "${sriObj.version}" does not match package.json "${pkg.version}"`);
      }
    } catch (err) {
      errors.push(`[version] Failed to parse dist/sri.json: ${err.message}`);
    }
  }

  // Target 8: dist/manifest.json
  const manifestPath = join(root, 'dist', 'manifest.json');
  if (!existsSync(manifestPath)) {
    errors.push('[version] Missing dist/manifest.json');
  } else {
    try {
      const manifestObj = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifestObj.version !== pkg.version) {
        errors.push(`[version] dist/manifest.json version "${manifestObj.version}" does not match package.json "${pkg.version}"`);
      }
    } catch (err) {
      errors.push(`[version] Failed to parse dist/manifest.json: ${err.message}`);
    }
  }
}

// 9. SHA256SUMS.txt standalone upload coverage
const releaseYmlPath = join(root, '.github', 'workflows', 'release.yml');
const sumsPath = join(root, 'dist', 'SHA256SUMS.txt');

if (!existsSync(sumsPath)) {
  errors.push('[checksums] Missing dist/SHA256SUMS.txt');
} else {
  const sumsText = readFileSync(sumsPath, 'utf8');
  const sumLines = sumsText.trim().split(/\r?\n/).filter(Boolean);
  const foundInSums = new Map();
  for (const line of sumLines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      errors.push(`[checksums] Invalid line in SHA256SUMS.txt: "${line}"`);
      continue;
    }
    const [sha, ...nameParts] = parts;
    const name = nameParts.join(' ');
    foundInSums.set(name, sha);
  }

  const expectedStandaloneAssets = new Map();
  if (existsSync(releaseYmlPath)) {
    const releaseYml = readFileSync(releaseYmlPath, 'utf8');
    const uploadMatch = releaseYml.match(/gh release upload [^\n]+\n([\s\S]*?)--clobber/);
    if (uploadMatch) {
      const lines = uploadMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/\\$/, '').trim())
        .filter(Boolean);
      for (const p of lines) {
        const base = basename(p);
        if (base === 'SHA256SUMS.txt') continue;
        expectedStandaloneAssets.set(base, p);
      }
    }
  }

  if (expectedStandaloneAssets.size === 0) {
    errors.push(
      '[checksums] Failed to parse standalone upload assets from .github/workflows/release.yml (expected release upload block with --clobber)',
    );
  }

  for (const [name, relPath] of expectedStandaloneAssets) {
    if (!foundInSums.has(name)) {
      errors.push(`[checksums] Uploaded release asset "${name}" (${relPath}) missing from dist/SHA256SUMS.txt`);
    }
  }

  for (const [name, declaredSha] of foundInSums) {
    const relPath = expectedStandaloneAssets.get(name);
    if (!relPath) {
      errors.push(`[checksums] dist/SHA256SUMS.txt contains unexpected asset "${name}" not in release upload list`);
      continue;
    }
    const fullPath = join(root, relPath);
    if (!existsSync(fullPath)) {
      errors.push(`[checksums] Asset "${name}" (${relPath}) in SHA256SUMS.txt does not exist on disk`);
    } else {
      const actualSha = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
      if (actualSha !== declaredSha) {
        errors.push(`[checksums] SHA-256 digest mismatch for "${name}": manifest has ${declaredSha}, computed ${actualSha}`);
      }
    }
  }
}

// 10. Documentation SRI digests verification
const docSriPath = join(root, 'dist', 'sri.json');
let tolCssIntegrity = null;
if (existsSync(docSriPath)) {
  try {
    const sriObj = JSON.parse(readFileSync(docSriPath, 'utf8'));
    tolCssIntegrity = sriObj.files?.['dist/css/tol.css']?.integrity;
    if (!tolCssIntegrity) {
      errors.push('[doc-sri] dist/sri.json missing files["dist/css/tol.css"].integrity');
    }
  } catch {
    // Already reported in version parity check
  }
}

const tolCssFile = join(root, 'dist', 'css', 'tol.css');
if (existsSync(tolCssFile) && tolCssIntegrity) {
  const actualHash = 'sha384-' + createHash('sha384').update(readFileSync(tolCssFile)).digest('base64');
  if (actualHash !== tolCssIntegrity) {
    errors.push(`[doc-sri] dist/sri.json integrity "${tolCssIntegrity}" does not match actual hash of dist/css/tol.css ("${actualHash}")`);
  }
}

for (const docRel of DOC_FILES) {
  const docPath = join(root, docRel);
  if (!existsSync(docPath)) {
    errors.push(`[doc-sri] Missing documentation file: ${docRel}`);
    continue;
  }
  const content = readFileSync(docPath, 'utf8');
  const match = content.match(DOC_LINK_REGEX);
  if (!match) {
    errors.push(`[doc-sri] ${docRel} missing pinned @<version> tol.css link with integrity attribute`);
    continue;
  }
  const [, docVersion, docIntegrity] = match;
  if (docVersion !== pkg.version) {
    errors.push(`[doc-sri] ${docRel} pinned version "${docVersion}" does not match package.json "${pkg.version}"`);
  }
  if (tolCssIntegrity && docIntegrity !== tolCssIntegrity) {
    errors.push(`[doc-sri] ${docRel} SRI integrity "${docIntegrity}" does not match dist/sri.json ("${tolCssIntegrity}")`);
  }
}

if (errors.length > 0) {
  console.error('✖ Lint failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('✔ Lint passed: 22 schemes valid, 0 JS syntax errors, 100% attribution headers, all exports verified, workflows audited, gallery verified, 8-target version parity verified, SHA256SUMS coverage verified, doc SRI digests verified.');
