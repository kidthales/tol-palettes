import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  semverToPep440,
  pypiClassifierFor,
  syncVersion,
  parseCliArgs,
  isValidDateString,
  getLocalDateString,
  SEMVER_REGEX,
  PEP440_REGEX,
  DATE_REGEX,
  DOC_FILES,
  DOC_LINK_REGEX,
  DOC_LINK_TAG_REGEX,
} from '../tools/sync-version.mjs';

test('SEMVER_REGEX validates strict X.Y.Z[-(alpha|beta|rc).N] format', () => {
  assert.ok(SEMVER_REGEX.test('0.3.1'));
  assert.ok(SEMVER_REGEX.test('1.0.0'));
  assert.ok(SEMVER_REGEX.test('1.0.0-alpha.1'));
  assert.ok(SEMVER_REGEX.test('1.0.0-beta.2'));
  assert.ok(SEMVER_REGEX.test('1.0.0-rc.10'));

  // Invalid formats must fail closed
  assert.ok(!SEMVER_REGEX.test('1.0'));
  assert.ok(!SEMVER_REGEX.test('v1.0.0'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-alpha'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-alpha.0'));
  assert.ok(!SEMVER_REGEX.test('1.0.0-preview.1'));
  assert.ok(!SEMVER_REGEX.test('1.0.0.0'));
  assert.ok(!SEMVER_REGEX.test(''));
});

test('PEP440_REGEX validates strict X.Y.Z[(a|b|rc)N] format', () => {
  assert.ok(PEP440_REGEX.test('0.3.1'));
  assert.ok(PEP440_REGEX.test('1.0.0'));
  assert.ok(PEP440_REGEX.test('1.0.0a1'));
  assert.ok(PEP440_REGEX.test('1.0.0b2'));
  assert.ok(PEP440_REGEX.test('1.0.0rc10'));

  // Invalid formats must fail closed
  assert.ok(!PEP440_REGEX.test('1.0.0-alpha.1'));
  assert.ok(!PEP440_REGEX.test('v1.0.0'));
  assert.ok(!PEP440_REGEX.test('1.0.0a0'));
  assert.ok(!PEP440_REGEX.test(''));
});

test('DATE_REGEX validates YYYY-MM-DD format', () => {
  assert.ok(DATE_REGEX.test('2026-11-12'));
  assert.ok(!DATE_REGEX.test('2026-1-1'));
  assert.ok(!DATE_REGEX.test('12-11-2026'));
  assert.ok(!DATE_REGEX.test('invalid'));
});

test('isValidDateString enforces strict calendar validity and handles leap years', () => {
  assert.ok(isValidDateString('2026-11-12'));
  assert.ok(isValidDateString('2024-02-29'), '2024 is a leap year');
  assert.ok(isValidDateString('2000-02-29'), '2000 is a leap year');

  // Invalid calendar dates must fail closed
  assert.ok(!isValidDateString('2026-13-45'));
  assert.ok(!isValidDateString('2026-02-29'), '2026 is not a leap year');
  assert.ok(!isValidDateString('2026-04-31'), 'April has 30 days');
  assert.ok(!isValidDateString('2026-00-10'));
  assert.ok(!isValidDateString('2026-12-00'));
  assert.ok(!isValidDateString('2026-1-1'));
  assert.ok(!isValidDateString(''));
  assert.ok(!isValidDateString(null));
  assert.ok(!isValidDateString(12345));
});

test('getLocalDateString returns valid YYYY-MM-DD date matching local calendar day', () => {
  const local = getLocalDateString();
  assert.ok(isValidDateString(local));
  assert.ok(DATE_REGEX.test(local));
});

test('DOC_LINK_TAG_REGEX matches single-line and multiline CDN link tags regardless of attribute order', () => {
  const single = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.1/dist/css/tol.css" integrity="sha384-xyz" crossorigin="anonymous">';
  const multiline = '<link\n  rel="stylesheet"\n  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.1/dist/css/tol.css"\n  integrity="sha384-xyz"\n  crossorigin="anonymous"\n/>';
  const reversed = '<link integrity="sha384-xyz" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.1/dist/css/tol.css" rel="stylesheet">';

  assert.ok(DOC_LINK_TAG_REGEX.test(single));
  assert.ok(DOC_LINK_TAG_REGEX.test(multiline));
  assert.ok(DOC_LINK_TAG_REGEX.test(reversed));

  const match = single.match(DOC_LINK_REGEX);
  assert.ok(match);
  assert.equal(match[1], '0.3.1');
  assert.equal(match[2], 'sha384-xyz');
});

test('semverToPep440 translates standard SemVer and pre-releases deterministically', () => {
  assert.equal(semverToPep440('0.3.1'), '0.3.1');
  assert.equal(semverToPep440('1.0.0'), '1.0.0');
  assert.equal(semverToPep440('1.0.0-alpha.1'), '1.0.0a1');
  assert.equal(semverToPep440('1.0.0-beta.2'), '1.0.0b2');
  assert.equal(semverToPep440('1.0.0-rc.3'), '1.0.0rc3');
  assert.equal(semverToPep440('2.14.7-alpha.15'), '2.14.7a15');
});

test('semverToPep440 throws RangeError on invalid or malformed SemVer strings', () => {
  assert.throws(() => semverToPep440('invalid'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('v1.0.0'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('1.0.0-alpha.0'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440('1.0.0-dev.1'), /Invalid SemVer format/);
  assert.throws(() => semverToPep440(null), /must be a non-empty string/);
  assert.throws(() => semverToPep440(123), /must be a non-empty string/);
});

test('pypiClassifierFor determines correct Development Status classifier', () => {
  assert.equal(pypiClassifierFor('1.0.0-alpha.1'), 'Development Status :: 3 - Alpha');
  assert.equal(pypiClassifierFor('1.0.0-beta.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('1.0.0-rc.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('1.0.0'), 'Development Status :: 5 - Production/Stable');
  assert.equal(pypiClassifierFor('2.0.0'), 'Development Status :: 5 - Production/Stable');
  assert.equal(pypiClassifierFor('0.3.1'), 'Development Status :: 4 - Beta');
  assert.equal(pypiClassifierFor('0.4.0-alpha.1'), 'Development Status :: 3 - Alpha');
});

test('pypiClassifierFor throws RangeError on invalid or non-string SemVer inputs', () => {
  assert.throws(() => pypiClassifierFor('invalid'), /Invalid SemVer format/);
  assert.throws(() => pypiClassifierFor(null), /must be a non-empty string/);
  assert.throws(() => pypiClassifierFor(123), /must be a non-empty string/);
});

test('parseCliArgs parses semver and date flags correctly', () => {
  assert.deepEqual(parseCliArgs(['1.0.0']), { semver: '1.0.0', date: null });
  assert.deepEqual(parseCliArgs(['1.0.0', '--date', '2026-11-12']), { semver: '1.0.0', date: '2026-11-12' });
  assert.deepEqual(parseCliArgs(['--date=2026-11-12', '1.0.0']), { semver: '1.0.0', date: '2026-11-12' });
  assert.deepEqual(parseCliArgs(['1.0.0-rc.1', '--date=2026-11-12']), { semver: '1.0.0-rc.1', date: '2026-11-12' });
});

test('parseCliArgs fails closed on missing semver, bare flags, unknown flags, and extra args', () => {
  assert.throws(() => parseCliArgs([]), /Missing required <semver> argument/);
  assert.throws(() => parseCliArgs(['--date']), /Flag --date requires a value/);
  assert.throws(() => parseCliArgs(['--date', '--other']), /Flag --date requires a value/);
  assert.throws(() => parseCliArgs(['--date=']), /Flag --date requires a value/);
  assert.throws(() => parseCliArgs(['1.0.0', '--unknown']), /Unknown option: "--unknown"/);
  assert.throws(() => parseCliArgs(['1.0.0', 'extra-arg']), /Unexpected extra argument: "extra-arg"/);
});

function createFixture(tmpDir, options = {}) {
  const pkg = { name: 'test-pkg', version: '0.1.0' };
  const lock = { name: 'test-pkg', version: '0.1.0', packages: { '': { version: '0.1.0' } } };
  const pyToml = options.corruptPyTomlVersion
    ? `[project]\nname = "test-pkg"\nclassifiers = [\n  "Development Status :: 4 - Beta",\n]\n`
    : options.corruptPyTomlClassifier
      ? `[project]\nname = "test-pkg"\nversion = "0.1.0"\nclassifiers = []\n`
      : `[project]\nname = "test-pkg"\nversion = "0.1.0"\nclassifiers = [\n  "Development Status :: 4 - Beta",\n]\n`;
  const cff = options.corruptCffVersion
    ? `cff-version: 1.2.0\ndate-released: 2026-01-01\n`
    : options.corruptCffDate
      ? `cff-version: 1.2.0\nversion: 0.1.0\n`
      : `cff-version: 1.2.0\nversion: 0.1.0\ndate-released: 2026-01-01\n`;

  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(join(tmpDir, 'pyproject.toml'), pyToml);
  writeFileSync(join(tmpDir, 'CITATION.cff'), cff);

  mkdirSync(join(tmpDir, 'dist'), { recursive: true });
  if (options.sri !== false) {
    writeFileSync(
      join(tmpDir, 'dist', 'sri.json'),
      JSON.stringify(
        {
          version: '0.1.0',
          files: {
            'dist/css/tol.css': {
              integrity: 'sha384-dummy-sri-hash-value-1234567890',
            },
          },
        },
        null,
        2,
      ),
    );
  }
  if (options.extraDistFile) {
    writeFileSync(join(tmpDir, 'dist', 'marker.txt'), 'original dist marker\n');
  }

  mkdirSync(join(tmpDir, 'docs'), { recursive: true });
  if (!options.missingDocsCss) {
    writeFileSync(
      join(tmpDir, 'docs', 'css.md'),
      options.corruptDocsCss
        ? 'No cdn link here\n'
        : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.1.0/dist/css/tol.css" integrity="sha384-old" crossorigin="anonymous">\n',
    );
  }

  if (!options.missingSec) {
    const secContent = `<link\r\n  rel="stylesheet"\r\n  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.1.0/dist/css/tol.css"\r\n  integrity="sha384-old"\r\n  crossorigin="anonymous"\r\n/>\r\n`;
    writeFileSync(join(tmpDir, 'SECURITY.md'), secContent);
  }

  if (!options.missingContrib) {
    const contribContent = `<link\n  rel="stylesheet"\n  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.1.0/dist/css/tol.css"\n  integrity="sha384-old"\n  crossorigin="anonymous"\n/>\n`;
    writeFileSync(join(tmpDir, 'CONTRIBUTING.md'), contribContent);
  }
}

test('syncVersion rewrites manifests and docs with runGenerate: false and preserves EOL', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-test-'));
  try {
    createFixture(tmpDir);

    const result = syncVersion('1.0.0-rc.1', {
      rootDir: tmpDir,
      runGenerate: false,
      date: '2026-11-12',
    });

    assert.equal(result.semver, '1.0.0-rc.1');
    assert.equal(result.pep440, '1.0.0rc1');
    assert.equal(result.pypiClassifier, 'Development Status :: 4 - Beta');
    assert.equal(result.date, '2026-11-12');
    assert.equal(result.tolCssIntegrity, 'sha384-dummy-sri-hash-value-1234567890');

    // 1. package.json
    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '1.0.0-rc.1');

    // 2. package-lock.json
    const lock = JSON.parse(readFileSync(join(tmpDir, 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '1.0.0-rc.1');
    assert.equal(lock.packages[''].version, '1.0.0-rc.1');

    // 3. pyproject.toml
    const pyToml = readFileSync(join(tmpDir, 'pyproject.toml'), 'utf8');
    assert.match(pyToml, /^version = "1\.0\.0rc1"/m);
    assert.match(pyToml, /"Development Status :: 4 - Beta"/);

    // 4. CITATION.cff
    const cff = readFileSync(join(tmpDir, 'CITATION.cff'), 'utf8');
    assert.match(cff, /^version: 1\.0\.0-rc\.1/m);
    assert.match(cff, /^date-released: 2026-11-12/m);

    // 5. docs/css.md
    const docsCss = readFileSync(join(tmpDir, 'docs', 'css.md'), 'utf8');
    assert.match(docsCss, /@kidthales\/tol-palettes@1\.0\.0-rc\.1\/dist\/css\/tol\.css/);
    assert.match(docsCss, /sha384-dummy-sri-hash-value-1234567890/);

    // 6. SECURITY.md (CRLF preserved)
    const sec = readFileSync(join(tmpDir, 'SECURITY.md'), 'utf8');
    assert.ok(sec.includes('\r\n'), 'SECURITY.md must preserve CRLF line endings');
    assert.match(sec, /@kidthales\/tol-palettes@1\.0\.0-rc\.1\/dist\/css\/tol\.css/);
    assert.match(sec, /sha384-dummy-sri-hash-value-1234567890/);

    // 7. CONTRIBUTING.md (LF preserved)
    const contrib = readFileSync(join(tmpDir, 'CONTRIBUTING.md'), 'utf8');
    assert.ok(!contrib.includes('\r\n'), 'CONTRIBUTING.md must preserve LF line endings');
    assert.match(contrib, /@kidthales\/tol-palettes@1\.0\.0-rc\.1\/dist\/css\/tol\.css/);
    assert.match(contrib, /sha384-dummy-sri-hash-value-1234567890/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion fails closed on invalid date format or impossible calendar dates', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-date-'));
  try {
    createFixture(tmpDir);
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026/11/12' }),
      /Invalid date format/,
    );
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-13-45' }),
      /Invalid date format.*Expected valid calendar YYYY-MM-DD/,
    );
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-02-29' }),
      /Invalid date format.*Expected valid calendar YYYY-MM-DD/,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion fails closed before mutation when doc regex fails to match', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-corrupt-doc-'));
  try {
    createFixture(tmpDir, { corruptDocsCss: true });
    const originalPkg = readFileSync(join(tmpDir, 'package.json'), 'utf8');
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Failed to match CDN link tag in .*docs.*css\.md/,
    );
    assert.equal(readFileSync(join(tmpDir, 'package.json'), 'utf8'), originalPkg);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion fails closed upfront before mutation when a required doc file is missing', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-missing-doc-'));
  try {
    createFixture(tmpDir, { missingDocsCss: true });
    const originalPkg = readFileSync(join(tmpDir, 'package.json'), 'utf8');
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Missing documentation file at .*docs.*css\.md/,
    );
    assert.equal(readFileSync(join(tmpDir, 'package.json'), 'utf8'), originalPkg);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion fails closed upfront before mutation when pyproject.toml is malformed', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-bad-py-'));
  try {
    createFixture(tmpDir, { corruptPyTomlVersion: true });
    const originalPkg = readFileSync(join(tmpDir, 'package.json'), 'utf8');
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Failed to match version field in .*pyproject\.toml/,
    );
    assert.equal(readFileSync(join(tmpDir, 'package.json'), 'utf8'), originalPkg);

    // Corrupt classifier
    createFixture(tmpDir, { corruptPyTomlClassifier: true });
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Failed to match Development Status classifier in .*pyproject\.toml/,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion fails closed upfront before mutation when CITATION.cff is malformed', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-bad-cff-'));
  try {
    createFixture(tmpDir, { corruptCffVersion: true });
    const originalPkg = readFileSync(join(tmpDir, 'package.json'), 'utf8');
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Failed to match version field in .*CITATION\.cff/,
    );
    assert.equal(readFileSync(join(tmpDir, 'package.json'), 'utf8'), originalPkg);

    // Corrupt date-released
    createFixture(tmpDir, { corruptCffDate: true });
    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /Failed to match date-released field in .*CITATION\.cff/,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syncVersion rolls back all mutations atomically if a failure occurs during execution, including dist/ restoration', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sync-ver-rollback-'));
  try {
    // Missing dist/sri.json triggers failure after manifests are modified
    createFixture(tmpDir, { sri: false, extraDistFile: true });

    const originalPkg = readFileSync(join(tmpDir, 'package.json'), 'utf8');
    const originalLock = readFileSync(join(tmpDir, 'package-lock.json'), 'utf8');
    const originalPy = readFileSync(join(tmpDir, 'pyproject.toml'), 'utf8');
    const originalCff = readFileSync(join(tmpDir, 'CITATION.cff'), 'utf8');
    const originalMarker = readFileSync(join(tmpDir, 'dist', 'marker.txt'), 'utf8');

    assert.throws(
      () => syncVersion('1.0.0', { rootDir: tmpDir, runGenerate: false, date: '2026-11-12' }),
      /dist\/sri\.json not found/,
    );

    // Verify atomic rollback: all files restored to pristine state
    assert.equal(readFileSync(join(tmpDir, 'package.json'), 'utf8'), originalPkg);
    assert.equal(readFileSync(join(tmpDir, 'package-lock.json'), 'utf8'), originalLock);
    assert.equal(readFileSync(join(tmpDir, 'pyproject.toml'), 'utf8'), originalPy);
    assert.equal(readFileSync(join(tmpDir, 'CITATION.cff'), 'utf8'), originalCff);
    assert.equal(readFileSync(join(tmpDir, 'dist', 'marker.txt'), 'utf8'), originalMarker);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
