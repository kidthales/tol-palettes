// Synchronizes project version across all manifests, outputs, and documentation:
// 1. Validates SemVer format: X.Y.Z[-(alpha|beta|rc).N]
// 2. Maps SemVer to PEP 440: X.Y.Z[(a|b|rc)N]
// 3. Updates package.json, package-lock.json, pyproject.toml, and CITATION.cff
// 4. Runs full `npm run generate` to produce all dist/ outputs and dist/sri.json
// 5. Updates pinned @<version> and real dist/css/tol.css SHA-384 SRI hashes in:
//    - docs/css.md
//    - SECURITY.md
//    - CONTRIBUTING.md

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/;
export const PEP440_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)([1-9]\d*))?$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const DOC_FILES = [
  'docs/css.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
];

export const DOC_LINK_REGEX = /<link[\s\S]*?href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@([^/"]+)\/dist\/css\/tol\.css"[\s\S]*?integrity="([^"]+)"/;
export const CSS_DOC_LINK_REGEX = /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"(?:\s+integrity="[^"]*")?(?:\s+crossorigin="anonymous")?\s*\/?>/;
export const INDENTED_DOC_LINK_REGEX = /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"\s+integrity="[^"]*"\s+crossorigin="anonymous"\s*\/>/;

/**
 * Translates SemVer (X.Y.Z[-(alpha|beta|rc).N]) to PEP 440 (X.Y.Z[(a|b|rc)N]).
 * Throws RangeError if input is not a valid recognized SemVer string.
 */
export function semverToPep440(semver) {
  if (typeof semver !== 'string') {
    throw new RangeError(`Invalid SemVer: must be a non-empty string, got ${typeof semver}`);
  }
  const match = semver.match(SEMVER_REGEX);
  if (!match) {
    throw new RangeError(
      `Invalid SemVer format: "${semver}". Expected X.Y.Z or X.Y.Z-(alpha|beta|rc).N (e.g. 1.0.0-alpha.1)`,
    );
  }
  const [, major, minor, patch, prereleaseType, prereleaseNum] = match;
  if (!prereleaseType) {
    return `${major}.${minor}.${patch}`;
  }
  const tagMap = {
    alpha: 'a',
    beta: 'b',
    rc: 'rc',
  };
  return `${major}.${minor}.${patch}${tagMap[prereleaseType]}${prereleaseNum}`;
}

/**
 * Returns PyPI Trove Development Status classifier string for a given SemVer.
 */
export function pypiClassifierFor(semver) {
  if (typeof semver !== 'string') {
    throw new RangeError(`Invalid SemVer: must be a non-empty string, got ${typeof semver}`);
  }
  const match = semver.match(SEMVER_REGEX);
  if (!match) {
    throw new RangeError(
      `Invalid SemVer format: "${semver}". Expected X.Y.Z or X.Y.Z-(alpha|beta|rc).N (e.g. 1.0.0-alpha.1)`,
    );
  }
  const [, majorStr, , , prereleaseType] = match;
  if (prereleaseType === 'alpha') {
    return 'Development Status :: 3 - Alpha';
  }
  if (prereleaseType === 'beta' || prereleaseType === 'rc') {
    return 'Development Status :: 4 - Beta';
  }
  const major = Number(majorStr);
  if (major === 0) {
    return 'Development Status :: 4 - Beta';
  }
  return 'Development Status :: 5 - Production/Stable';
}

/**
 * Executes full version synchronization with atomic rollback on failure.
 */
export function syncVersion(semver, options = {}) {
  const rootDir = options.rootDir || defaultRoot;
  const runGenerate = options.runGenerate ?? true;
  const date = options.date || new Date().toISOString().slice(0, 10);

  if (!DATE_REGEX.test(date)) {
    throw new RangeError(`Invalid date format: "${date}". Expected YYYY-MM-DD`);
  }

  const pep440 = semverToPep440(semver);
  const pypiClassifier = pypiClassifierFor(semver);

  const pkgPath = join(rootDir, 'package.json');
  const lockPath = join(rootDir, 'package-lock.json');
  const pyPath = join(rootDir, 'pyproject.toml');
  const cffPath = join(rootDir, 'CITATION.cff');
  const docsCssPath = join(rootDir, 'docs', 'css.md');
  const secPath = join(rootDir, 'SECURITY.md');
  const contribPath = join(rootDir, 'CONTRIBUTING.md');

  // Verify manifests exist upfront
  if (!existsSync(pkgPath)) {
    throw new Error(`Missing package.json at ${pkgPath}`);
  }
  if (!existsSync(pyPath)) {
    throw new Error(`Missing pyproject.toml at ${pyPath}`);
  }
  if (!existsSync(cffPath)) {
    throw new Error(`Missing CITATION.cff at ${cffPath}`);
  }

  // Verify doc files regex matches upfront before making any mutations
  if (existsSync(docsCssPath)) {
    const docsCss = readFileSync(docsCssPath, 'utf8');
    if (!CSS_DOC_LINK_REGEX.test(docsCss)) {
      throw new Error(`Failed to match CDN link tag in ${docsCssPath} for version and SRI update`);
    }
  }
  if (existsSync(secPath)) {
    const sec = readFileSync(secPath, 'utf8');
    if (!INDENTED_DOC_LINK_REGEX.test(sec)) {
      throw new Error(`Failed to match CDN link tag in ${secPath} for version and SRI update`);
    }
  }
  if (existsSync(contribPath)) {
    const contrib = readFileSync(contribPath, 'utf8');
    if (!INDENTED_DOC_LINK_REGEX.test(contrib)) {
      throw new Error(`Failed to match CDN link tag in ${contribPath} for version and SRI update`);
    }
  }

  // Snapshot all original file contents to guarantee atomic rollback on any failure
  const originalSnapshots = new Map();
  const targetPaths = [pkgPath, lockPath, pyPath, cffPath, docsCssPath, secPath, contribPath];
  for (const p of targetPaths) {
    if (existsSync(p)) {
      originalSnapshots.set(p, readFileSync(p));
    }
  }

  const rollback = () => {
    for (const [filePath, content] of originalSnapshots.entries()) {
      try {
        writeFileSync(filePath, content);
      } catch (rollbackErr) {
        console.error(`Failed to rollback ${filePath}: ${rollbackErr.message}`);
      }
    }
  };

  try {
    // 1. Update package.json
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.version = semver;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // 2. Update package-lock.json if present
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      lock.version = semver;
      if (lock.packages && lock.packages['']) {
        lock.packages[''].version = semver;
      }
      writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    }

    // 3. Update pyproject.toml
    let pyToml = readFileSync(pyPath, 'utf8');
    pyToml = pyToml.replace(/^version\s*=\s*["'][^"']+["']/m, `version = "${pep440}"`);
    pyToml = pyToml.replace(/"Development Status :: [^"]+"/, `"${pypiClassifier}"`);
    writeFileSync(pyPath, pyToml);

    // 4. Update CITATION.cff
    let cff = readFileSync(cffPath, 'utf8');
    cff = cff.replace(/^version:\s*[^\s\r\n]+/m, `version: ${semver}`);
    cff = cff.replace(/^date-released:\s*[^\s\r\n]+/m, `date-released: ${date}`);
    writeFileSync(cffPath, cff);

    // 5. Execute generator if requested
    if (runGenerate) {
      execSync('npm run generate', { cwd: rootDir, stdio: 'inherit' });
    }

    // 6. Read dist/sri.json for real tol.css SRI hash
    const sriPath = join(rootDir, 'dist', 'sri.json');
    if (!existsSync(sriPath)) {
      throw new Error(`dist/sri.json not found at ${sriPath}. Run generator before updating documentation.`);
    }
    const sri = JSON.parse(readFileSync(sriPath, 'utf8'));
    const tolCssIntegrity = sri.files?.['dist/css/tol.css']?.integrity;
    if (!tolCssIntegrity) {
      throw new Error('dist/sri.json does not contain integrity for dist/css/tol.css');
    }

    // 7. Update docs/css.md
    if (existsSync(docsCssPath)) {
      let docsCss = readFileSync(docsCssPath, 'utf8');
      docsCss = docsCss.replace(
        CSS_DOC_LINK_REGEX,
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css" integrity="${tolCssIntegrity}" crossorigin="anonymous">`,
      );
      writeFileSync(docsCssPath, docsCss);
    }

    // 8. Update SECURITY.md
    if (existsSync(secPath)) {
      let sec = readFileSync(secPath, 'utf8');
      const eol = sec.includes('\r\n') ? '\r\n' : '\n';
      sec = sec.replace(
        INDENTED_DOC_LINK_REGEX,
        `<link${eol}  rel="stylesheet"${eol}  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css"${eol}  integrity="${tolCssIntegrity}"${eol}  crossorigin="anonymous"${eol}/>`,
      );
      writeFileSync(secPath, sec);
    }

    // 9. Update CONTRIBUTING.md
    if (existsSync(contribPath)) {
      let contrib = readFileSync(contribPath, 'utf8');
      const eol = contrib.includes('\r\n') ? '\r\n' : '\n';
      contrib = contrib.replace(
        INDENTED_DOC_LINK_REGEX,
        `<link${eol}  rel="stylesheet"${eol}  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css"${eol}  integrity="${tolCssIntegrity}"${eol}  crossorigin="anonymous"${eol}/>`,
      );
      writeFileSync(contribPath, contrib);
    }

    return {
      semver,
      pep440,
      pypiClassifier,
      date,
      tolCssIntegrity,
    };
  } catch (err) {
    rollback();
    throw err;
  }
}

/**
 * Parses CLI arguments strictly for sync-version.
 */
export function parseCliArgs(args) {
  let semverArg = null;
  let dateArg = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--date') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        throw new Error('Flag --date requires a value (YYYY-MM-DD)');
      }
      dateArg = args[++i];
    } else if (arg.startsWith('--date=')) {
      dateArg = arg.slice(7);
      if (!dateArg) {
        throw new Error('Flag --date requires a value (YYYY-MM-DD)');
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: "${arg}"`);
    } else if (!semverArg) {
      semverArg = arg;
    } else {
      throw new Error(`Unexpected extra argument: "${arg}"`);
    }
  }

  if (!semverArg) {
    throw new Error('Missing required <semver> argument');
  }

  return { semver: semverArg, date: dateArg };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const { semver, date } = parseCliArgs(process.argv.slice(2));
    const result = syncVersion(semver, { date });
    console.log(
      `✔ Synchronized version to ${result.semver} (PEP 440: ${result.pep440}, status: "${result.pypiClassifier}", date: ${result.date})`,
    );
    console.log(`  tol.css SRI: ${result.tolCssIntegrity}`);
  } catch (err) {
    console.error(`✖ sync-version failed: ${err.message}`);
    process.exit(1);
  }
}
