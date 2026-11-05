import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('npm pack --dry-run enforces size budgets and excludes dev/CI files', () => {
  const raw = execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8' });
  const [info] = JSON.parse(raw);

  assert.equal(info.name, '@kidthales/tol-palettes');
  assert.ok(info.size <= 95 * 1024, `Tarball size ${info.size} B exceeds 95 KB budget`);
  assert.ok(info.unpackedSize <= 650 * 1024, `Unpacked size ${info.unpackedSize} B exceeds 650 KB budget`);

  const paths = info.files.map((f) => f.path);
  assert.ok(paths.includes('LICENSE'), 'LICENSE must be included in tarball');
  assert.ok(paths.includes('NOTICE'), 'NOTICE must be included in tarball');
  assert.ok(paths.includes('README.md'), 'README.md must be included in tarball');
  assert.ok(paths.includes('dist/js/index.js'), 'dist/js/index.js must be included');
  assert.ok(paths.includes('dist/js/index.d.ts'), 'dist/js/index.d.ts must be included');
  assert.ok(paths.includes('dist/css/tol.css'), 'dist/css/tol.css must be included');
  assert.ok(paths.includes('dist/sri.json'), 'dist/sri.json must be included');
  assert.ok(paths.includes('dist/sri.d.ts'), 'dist/sri.d.ts must be included');
  assert.ok(paths.includes('dist/json/schemes.json'), 'dist/json/schemes.json must be included');
  assert.ok(paths.includes('dist/json/schemes.d.ts'), 'dist/json/schemes.d.ts must be included');
  assert.ok(paths.includes('dist/py/tol_palettes.py'), 'dist/py/tol_palettes.py must be included');

  for (const p of paths) {
    assert.doesNotMatch(
      p,
      /^(\.github|tests|tools|docs|dist\/gallery)\//,
      `Dev/CI/gallery file "${p}" must not leak into npm tarball`,
    );
    assert.doesNotMatch(
      p,
      /(\.pyc$|__pycache__)/,
      `Python bytecode file "${p}" must not leak into npm tarball`,
    );
  }
});

test('all package.json exports resolve to existing files or directories', () => {
  assert.ok(pkg.exports, 'package.json must declare exports');
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const targets = typeof target === 'string' ? [target] : Object.values(target);
    for (const t of targets) {
      const checkPath = t.includes('*') ? t.replace(/\/?\*.*$/, '') : t;
      assert.ok(existsSync(join(root, checkPath)), `Export ${subpath} -> ${t} missing on disk`);
    }
  }
});

test('package.json exports ./sri and ./schemes.json configure types conditions', () => {
  assert.deepEqual(pkg.exports['./sri'], {
    types: './dist/sri.d.ts',
    default: './dist/sri.json',
  });
  assert.deepEqual(pkg.exports['./schemes.json'], {
    types: './dist/json/schemes.d.ts',
    default: './dist/json/schemes.json',
  });
  const sri = JSON.parse(readFileSync(join(root, 'dist', 'sri.json'), 'utf8'));
  assert.equal(sri.package, pkg.name);
  assert.equal(sri.version, pkg.version);
});

test('external ESM consumer import and TypeScript declaration integrity', async () => {
  const mod = await import('../dist/js/index.js');
  assert.equal(Object.keys(mod.schemes).length, 22, 'Must export all 22 schemes');
  assert.equal(typeof mod.interpolate, 'function');
  assert.equal(typeof mod.discreteRainbow, 'function');
  assert.equal(typeof mod.discreteColors, 'function');
  assert.equal(typeof mod.sample, 'function');

  const dts = readFileSync(join(root, 'dist', 'js', 'index.d.ts'), 'utf8');
  assert.match(dts, /export interface Scheme\b/);
  assert.match(dts, /export declare const schemes: Readonly<Record<SchemeId, Scheme>>;/);
  assert.match(dts, /export declare function interpolate\(/);
});

test('version parity across package.json, pyproject.toml, CITATION.cff, and plugin.cfg', () => {
  const pkgVer = pkg.version;

  const pyToml = readFileSync(join(root, 'pyproject.toml'), 'utf8');
  const pyMatch = pyToml.match(/^version\s*=\s*["']([^"']+)["']/m);
  assert.ok(pyMatch, 'pyproject.toml must define version');
  assert.equal(pyMatch[1], pkgVer, `pyproject.toml version ${pyMatch[1]} != ${pkgVer}`);

  const cff = readFileSync(join(root, 'CITATION.cff'), 'utf8');
  const cffMatch = cff.match(/^version:\s*([^\s\r\n]+)/m);
  assert.ok(cffMatch, 'CITATION.cff must define version');
  assert.equal(cffMatch[1], pkgVer, `CITATION.cff version ${cffMatch[1]} != ${pkgVer}`);

  const godotCfg = readFileSync(join(root, 'dist', 'godot', 'addons', 'tol_palettes', 'plugin.cfg'), 'utf8');
  const godotMatch = godotCfg.match(/^version="([^"]+)"/m);
  assert.ok(godotMatch, 'plugin.cfg must define version');
  assert.equal(godotMatch[1], pkgVer, `plugin.cfg version ${godotMatch[1]} != ${pkgVer}`);
});

test('release.yml workflow enforces tag-guard parity and uploads valid asset paths', () => {
  const releaseYml = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');

  // Verify tag-guard checks package.json, pyproject.toml, CITATION.cff, plugin.cfg
  assert.match(releaseYml, /require\('\.\/package\.json'\)\.version/);
  assert.match(releaseYml, /pyproject\.toml/);
  assert.match(releaseYml, /CITATION\.cff/);
  assert.match(releaseYml, /dist\/godot\/addons\/tol_palettes\/plugin\.cfg/);

  // Extract uploaded asset paths from attach-assets job
  const uploadMatch = releaseYml.match(/gh release upload [^\n]+\n([\s\S]*?)--clobber/);
  assert.ok(uploadMatch, 'release.yml must upload assets with gh release upload');
  const lines = uploadMatch[1]
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\\$/, '').trim())
    .filter(Boolean);

  assert.ok(lines.length > 0, 'Must specify asset paths for upload');
  for (const assetPath of lines) {
    assert.ok(existsSync(join(root, assetPath)), `Uploaded asset path does not exist on disk: ${assetPath}`);
  }

  // Ensure primary zip bundles are covered
  assert.ok(lines.includes('dist/assets/tol-palettes-godot.zip'));
  assert.ok(lines.includes('dist/assets/tol-palettes-aseprite.zip'));
  assert.ok(lines.includes('dist/assets/tol-palettes-gpl.zip'));
});
