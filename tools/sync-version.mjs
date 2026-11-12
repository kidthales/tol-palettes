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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
 * Executes full version synchronization.
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

  // 1. Update package.json
  const pkgPath = join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = semver;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // 2. Update package-lock.json if present
  const lockPath = join(rootDir, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = semver;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = semver;
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }

  // 3. Update pyproject.toml
  const pyPath = join(rootDir, 'pyproject.toml');
  let pyToml = readFileSync(pyPath, 'utf8');
  pyToml = pyToml.replace(/^version\s*=\s*["'][^"']+["']/m, `version = "${pep440}"`);
  pyToml = pyToml.replace(/"Development Status :: [^"]+"/, `"${pypiClassifier}"`);
  writeFileSync(pyPath, pyToml);

  // 4. Update CITATION.cff
  const cffPath = join(rootDir, 'CITATION.cff');
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
  const docsCssPath = join(rootDir, 'docs', 'css.md');
  if (existsSync(docsCssPath)) {
    let docsCss = readFileSync(docsCssPath, 'utf8');
    const cssLinkRegex = /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"(?:\s+integrity="[^"]*")?(?:\s+crossorigin="anonymous")?\s*\/?>/;
    docsCss = docsCss.replace(
      cssLinkRegex,
      `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css" integrity="${tolCssIntegrity}" crossorigin="anonymous">`,
    );
    writeFileSync(docsCssPath, docsCss);
  }

  // 8. Update SECURITY.md
  const secPath = join(rootDir, 'SECURITY.md');
  if (existsSync(secPath)) {
    let sec = readFileSync(secPath, 'utf8');
    const eol = sec.includes('\r\n') ? '\r\n' : '\n';
    const secLinkRegex = /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"\s+integrity="[^"]*"\s+crossorigin="anonymous"\s*\/>/;
    sec = sec.replace(
      secLinkRegex,
      `<link${eol}  rel="stylesheet"${eol}  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@${semver}/dist/css/tol.css"${eol}  integrity="${tolCssIntegrity}"${eol}  crossorigin="anonymous"${eol}/>`,
    );
    writeFileSync(secPath, sec);
  }

  // 9. Update CONTRIBUTING.md
  const contribPath = join(rootDir, 'CONTRIBUTING.md');
  if (existsSync(contribPath)) {
    let contrib = readFileSync(contribPath, 'utf8');
    const eol = contrib.includes('\r\n') ? '\r\n' : '\n';
    const contribLinkRegex = /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@kidthales\/tol-palettes@[^/"]+\/dist\/css\/tol\.css"\s+integrity="[^"]*"\s+crossorigin="anonymous"\s*\/>/;
    contrib = contrib.replace(
      contribLinkRegex,
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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let semverArg = null;
  let dateArg = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--date') {
      dateArg = args[++i];
    } else if (arg.startsWith('--date=')) {
      dateArg = arg.slice(7);
    } else if (!arg.startsWith('-') && !semverArg) {
      semverArg = arg;
    }
  }

  if (!semverArg) {
    console.error('Usage: node tools/sync-version.mjs <semver> [--date YYYY-MM-DD]');
    console.error('Example: node tools/sync-version.mjs 1.0.0-alpha.1 --date 2026-11-12');
    process.exit(1);
  }

  try {
    const result = syncVersion(semverArg, { date: dateArg });
    console.log(
      `✔ Synchronized version to ${result.semver} (PEP 440: ${result.pep440}, status: "${result.pypiClassifier}", date: ${result.date})`,
    );
    console.log(`  tol.css SRI: ${result.tolCssIntegrity}`);
  } catch (err) {
    console.error(`✖ sync-version failed: ${err.message}`);
    process.exit(1);
  }
}
