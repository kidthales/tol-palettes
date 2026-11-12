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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

export const DOC_LINK_TAG_REGEX = /<link\b[^>]*?\bhref="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"[^>]*?\/?>/;
export const DOC_LINK_REGEX = /<link\b[^>]*?\bhref="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@([^/"]+)\/dist\/css\/tol\.css"[^>]*?\bintegrity="([^"]+)"[^>]*?\/?>/;
export const CSS_DOC_LINK_REGEX = DOC_LINK_TAG_REGEX;
export const INDENTED_DOC_LINK_REGEX = DOC_LINK_TAG_REGEX;

export const PYPROJECT_VERSION_REGEX = /^version\s*=\s*["'][^"']+["']/m;
export const PYPROJECT_CLASSIFIER_REGEX = /"Development Status :: [^"]+"/;
export const CFF_VERSION_REGEX = /^version:\s*[^\s\r\n]+/m;
export const CFF_DATE_REGEX = /^date-released:\s*[^\s\r\n]+/m;

/**
 * Checks if a given date string is a valid Gregorian calendar date in YYYY-MM-DD format.
 */
export function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return (
    dateObj.getUTCFullYear() === y &&
    dateObj.getUTCMonth() === m - 1 &&
    dateObj.getUTCDate() === d
  );
}

/**
 * Returns the operator's current local calendar date formatted as YYYY-MM-DD.
 */
export function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
 * If dist/ rollback encounters any filesystem issue, re-running `npm run generate`
 * fully reconstructs all dist/ assets deterministically.
 */
export function syncVersion(semver, options = {}) {
  const rootDir = options.rootDir || defaultRoot;
  const runGenerate = options.runGenerate ?? true;
  const date = options.date || getLocalDateString();

  if (!isValidDateString(date)) {
    throw new RangeError(`Invalid date format: "${date}". Expected valid calendar YYYY-MM-DD`);
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
  const distPath = join(rootDir, 'dist');

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

  // Verify required documentation files exist and match link tag upfront before any mutations
  for (const docRel of DOC_FILES) {
    const docPath = join(rootDir, docRel);
    if (!existsSync(docPath)) {
      throw new Error(`Missing documentation file at ${docPath}`);
    }
    const docContent = readFileSync(docPath, 'utf8');
    if (!DOC_LINK_TAG_REGEX.test(docContent)) {
      throw new Error(`Failed to match CDN link tag in ${docPath} for version and SRI update`);
    }
  }

  // Pre-validate pyproject.toml and CITATION.cff regex matches upfront
  const initialPyToml = readFileSync(pyPath, 'utf8');
  if (!PYPROJECT_VERSION_REGEX.test(initialPyToml)) {
    throw new Error(`Failed to match version field in ${pyPath}`);
  }
  if (!PYPROJECT_CLASSIFIER_REGEX.test(initialPyToml)) {
    throw new Error(`Failed to match Development Status classifier in ${pyPath}`);
  }

  const initialCff = readFileSync(cffPath, 'utf8');
  if (!CFF_VERSION_REGEX.test(initialCff)) {
    throw new Error(`Failed to match version field in ${cffPath}`);
  }
  if (!CFF_DATE_REGEX.test(initialCff)) {
    throw new Error(`Failed to match date-released field in ${cffPath}`);
  }

  // Snapshot all original file contents and dist/ directory to guarantee atomic rollback on any failure
  const originalSnapshots = new Map();
  const targetPaths = [pkgPath, lockPath, pyPath, cffPath, docsCssPath, secPath, contribPath];
  for (const p of targetPaths) {
    if (existsSync(p)) {
      originalSnapshots.set(p, readFileSync(p));
    }
  }

  const distExisted = existsSync(distPath);
  let distBackupDir = null;
  if (distExisted) {
    distBackupDir = mkdtempSync(join(tmpdir(), 'tol-dist-backup-'));
    cpSync(distPath, join(distBackupDir, 'dist'), { recursive: true });
  }

  const rollback = () => {
    for (const [filePath, content] of originalSnapshots.entries()) {
      try {
        writeFileSync(filePath, content);
      } catch (rollbackErr) {
        console.error(`Failed to rollback ${filePath}: ${rollbackErr.message}`);
      }
    }
    if (distExisted && distBackupDir && existsSync(join(distBackupDir, 'dist'))) {
      try {
        rmSync(distPath, { recursive: true, force: true });
        cpSync(join(distBackupDir, 'dist'), distPath, { recursive: true });
      } catch (rollbackErr) {
        console.error(`Failed to rollback dist directory: ${rollbackErr.message}. Re-run 'npm run generate' to reconstruct.`);
      }
    } else if (!distExisted && existsSync(distPath)) {
      try {
        rmSync(distPath, { recursive: true, force: true });
      } catch (rollbackErr) {
        console.error(`Failed to clean up dist directory: ${rollbackErr.message}`);
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
    if (!PYPROJECT_VERSION_REGEX.test(pyToml)) {
      throw new Error(`Failed to match version field in ${pyPath}`);
    }
    if (!PYPROJECT_CLASSIFIER_REGEX.test(pyToml)) {
      throw new Error(`Failed to match Development Status classifier in ${pyPath}`);
    }
    pyToml = pyToml.replace(PYPROJECT_VERSION_REGEX, `version = "${pep440}"`);
    pyToml = pyToml.replace(PYPROJECT_CLASSIFIER_REGEX, `"${pypiClassifier}"`);
    writeFileSync(pyPath, pyToml);

    // 4. Update CITATION.cff
    let cff = readFileSync(cffPath, 'utf8');
    if (!CFF_VERSION_REGEX.test(cff)) {
      throw new Error(`Failed to match version field in ${cffPath}`);
    }
    if (!CFF_DATE_REGEX.test(cff)) {
      throw new Error(`Failed to match date-released field in ${cffPath}`);
    }
    cff = cff.replace(CFF_VERSION_REGEX, `version: ${semver}`);
    cff = cff.replace(CFF_DATE_REGEX, `date-released: ${date}`);
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
    let docsCss = readFileSync(docsCssPath, 'utf8');
    docsCss = docsCss.replace(
      DOC_LINK_TAG_REGEX,
      `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css" integrity="${tolCssIntegrity}" crossorigin="anonymous">`,
    );
    writeFileSync(docsCssPath, docsCss);

    // 8. Update SECURITY.md
    let sec = readFileSync(secPath, 'utf8');
    const secEol = sec.includes('\r\n') ? '\r\n' : '\n';
    sec = sec.replace(
      DOC_LINK_TAG_REGEX,
      `<link${secEol}  rel="stylesheet"${secEol}  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css"${secEol}  integrity="${tolCssIntegrity}"${secEol}  crossorigin="anonymous"${secEol}/>`,
    );
    writeFileSync(secPath, sec);

    // 9. Update CONTRIBUTING.md
    let contrib = readFileSync(contribPath, 'utf8');
    const contribEol = contrib.includes('\r\n') ? '\r\n' : '\n';
    contrib = contrib.replace(
      DOC_LINK_TAG_REGEX,
      `<link${contribEol}  rel="stylesheet"${contribEol}  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css"${contribEol}  integrity="${tolCssIntegrity}"${contribEol}  crossorigin="anonymous"${contribEol}/>`,
    );
    writeFileSync(contribPath, contrib);

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
  } finally {
    if (distBackupDir) {
      try {
        rmSync(distBackupDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup of temp dir
      }
    }
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
      dateArg = arg.slice('--date='.length);
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
