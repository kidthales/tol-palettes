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
