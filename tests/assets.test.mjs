import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from '../tools/validate.mjs';
import {
  buildZip,
  parsePkZipEntries,
  resolveDefaultZipMtime,
  DEFAULT_ZIP_MTIME,
  MAX_ZIP_ENTRIES,
} from '../tools/zip-util.mjs';
import { packageAllAssets, generateSriManifest } from '../tools/package-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemes = loadSchemes().map((x) => x.data);
const rootLicense = readFileSync(join(root, 'LICENSE'), 'utf8');
const rootNotice = readFileSync(join(root, 'NOTICE'), 'utf8');

test('dist/assets contains valid zip bundles for Godot, Aseprite, and GPL with LICENSE and NOTICE', () => {
  const assetsDir = join(root, 'dist', 'assets');
  const godotZipPath = join(assetsDir, 'tol-palettes-godot.zip');
  const asepriteZipPath = join(assetsDir, 'tol-palettes-aseprite.zip');
  const gplZipPath = join(assetsDir, 'tol-palettes-gpl.zip');

  assert.ok(existsSync(godotZipPath), 'tol-palettes-godot.zip must exist');
  assert.ok(existsSync(asepriteZipPath), 'tol-palettes-aseprite.zip must exist');
  assert.ok(existsSync(gplZipPath), 'tol-palettes-gpl.zip must exist');

  // 1. Verify Godot Zip
  const godotBuffer = readFileSync(godotZipPath);
  const godotEntries = parsePkZipEntries(godotBuffer);
  // Expected: schemes.length .tres + 1 .gd + 1 plugin.cfg + LICENSE + NOTICE
  const expectedGodotCount = schemes.length + 4;
  assert.equal(
    godotEntries.length,
    expectedGodotCount,
    `Godot zip must contain exactly ${expectedGodotCount} files (${schemes.length} tres + 1 gd + plugin.cfg + LICENSE + NOTICE)`,
  );

  const godotPaths = godotEntries.map((e) => e.path);
  for (const p of godotPaths) {
    assert.ok(p.startsWith('addons/tol_palettes/'), `Godot path must start with addons/tol_palettes/: ${p}`);
  }

  assert.ok(godotPaths.includes('addons/tol_palettes/plugin.cfg'), 'plugin.cfg must be present in Godot zip');
  assert.ok(godotPaths.includes('addons/tol_palettes/tol_palettes.gd'), 'tol_palettes.gd must be present in Godot zip');
  assert.ok(godotPaths.includes('addons/tol_palettes/LICENSE'), 'LICENSE must be present in Godot zip');
  assert.ok(godotPaths.includes('addons/tol_palettes/NOTICE'), 'NOTICE must be present in Godot zip');

  const godotLicense = godotEntries.find((e) => e.path === 'addons/tol_palettes/LICENSE');
  assert.equal(godotLicense.data.toString('utf8'), rootLicense);
  const godotNotice = godotEntries.find((e) => e.path === 'addons/tol_palettes/NOTICE');
  assert.equal(godotNotice.data.toString('utf8'), rootNotice);

  for (const s of schemes) {
    assert.ok(
      godotPaths.includes(`addons/tol_palettes/${s.id}.tres`),
      `addons/tol_palettes/${s.id}.tres missing in Godot zip`,
    );
  }

  const pluginCfgEntry = godotEntries.find((e) => e.path === 'addons/tol_palettes/plugin.cfg');
  const pluginCfgText = pluginCfgEntry.data.toString('utf8');
  assert.match(pluginCfgText, /\[plugin\]/);
  assert.match(pluginCfgText, /name="Paul Tol Colour Palettes"/);
  assert.match(pluginCfgText, /Paul Tol/);

  // 2. Verify Aseprite Zip
  const aseBuffer = readFileSync(asepriteZipPath);
  const aseEntries = parsePkZipEntries(aseBuffer);
  // Expected: schemes.length .gpl + LICENSE + NOTICE
  const expectedAseCount = schemes.length + 2;
  assert.equal(aseEntries.length, expectedAseCount, `Aseprite zip must contain ${expectedAseCount} files (${schemes.length} .gpl + LICENSE + NOTICE)`);
  assert.ok(aseEntries.some((e) => e.path === 'LICENSE'), 'Aseprite zip must contain LICENSE');
  assert.ok(aseEntries.some((e) => e.path === 'NOTICE'), 'Aseprite zip must contain NOTICE');
  const aseLicense = aseEntries.find((e) => e.path === 'LICENSE');
  assert.equal(aseLicense.data.toString('utf8'), rootLicense);

  for (const s of schemes) {
    const entry = aseEntries.find((e) => e.path === `${s.id}.gpl`);
    assert.ok(entry, `Aseprite zip missing ${s.id}.gpl`);
    const text = entry.data.toString('utf8');
    assert.match(text, /GIMP Palette/);
    assert.match(text, /Aseprite-compatible GIMP Palette/);
    assert.match(text, /Paul Tol/);
  }

  // 3. Verify GPL Zip
  const gplBuffer = readFileSync(gplZipPath);
  const gplEntries = parsePkZipEntries(gplBuffer);
  // Expected: schemes.length .gpl + LICENSE + NOTICE
  const expectedGplCount = schemes.length + 2;
  assert.equal(gplEntries.length, expectedGplCount, `GPL zip must contain ${expectedGplCount} files (${schemes.length} .gpl + LICENSE + NOTICE)`);
  assert.ok(gplEntries.some((e) => e.path === 'LICENSE'), 'GPL zip must contain LICENSE');
  assert.ok(gplEntries.some((e) => e.path === 'NOTICE'), 'GPL zip must contain NOTICE');
  const gplLicense = gplEntries.find((e) => e.path === 'LICENSE');
  assert.equal(gplLicense.data.toString('utf8'), rootLicense);

  for (const s of schemes) {
    const entry = gplEntries.find((e) => e.path === `${s.id}.gpl`);
    assert.ok(entry, `GPL zip missing ${s.id}.gpl`);
    const text = entry.data.toString('utf8');
    assert.match(text, /GIMP Palette/);
    assert.match(text, /Paul Tol/);
    assert.ok(!text.includes('Aseprite-compatible'), 'Standard GPL must not have Aseprite comment line');
  }
});

test('buildZip enforces entry name validation and rejects invalid paths', () => {
  assert.throws(() => buildZip([{ path: '', data: 'x' }]), /must be a non-empty string/);
  assert.throws(() => buildZip([{ path: '   ', data: 'x' }]), /must be a non-empty string/);
  assert.throws(() => buildZip([{ path: 'foo\0bar.txt', data: 'x' }]), /contains null bytes/);
  assert.throws(() => buildZip([{ path: '/absolute/path.txt', data: 'x' }]), /absolute paths or drive letters are forbidden/);
  assert.throws(() => buildZip([{ path: 'C:/drive/path.txt', data: 'x' }]), /absolute paths or drive letters are forbidden/);
  assert.throws(() => buildZip([{ path: 'D:\\drive\\path.txt', data: 'x' }]), /absolute paths or drive letters are forbidden/);
  assert.throws(() => buildZip([{ path: 'foo/../bar.txt', data: 'x' }]), /path traversal/);
  assert.throws(() => buildZip([{ path: '../escape.txt', data: 'x' }]), /path traversal/);
  assert.throws(
    () => buildZip([{ path: 'dup.txt', data: '1' }, { path: 'dup.txt', data: '2' }]),
    /duplicate entry path in archive/,
  );
});

test('buildZip is deterministic across entry order permutations', () => {
  const entries1 = [
    { path: 'c.txt', data: 'Three' },
    { path: 'a.txt', data: 'One' },
    { path: 'b.txt', data: 'Two' },
    { path: 'nested/z.txt', data: 'Nested Z' },
    { path: 'nested/a.txt', data: 'Nested A' },
  ];
  const entries2 = [
    { path: 'nested/a.txt', data: 'Nested A' },
    { path: 'b.txt', data: 'Two' },
    { path: 'nested/z.txt', data: 'Nested Z' },
    { path: 'c.txt', data: 'Three' },
    { path: 'a.txt', data: 'One' },
  ];

  const fixedDate = new Date('2026-01-01T00:00:00Z');
  const zip1 = buildZip(entries1, { mtime: fixedDate });
  const zip2 = buildZip(entries2, { mtime: fixedDate });
  assert.deepEqual(zip1, zip2, 'buildZip output must be byte-identical regardless of input entry order');
});

test('packageAllAssets and generateSriManifest fail closed when expected input files are missing', () => {
  const tempOut = mkdtempSync(join(tmpdir(), 'tol-missing-test-'));
  try {
    assert.throws(
      () => generateSriManifest(tempOut),
      /Cannot generate SRI manifest: required dist directories/,
    );
    assert.throws(
      () => packageAllAssets({ outDir: tempOut, allowedRoot: tmpdir() }),
      /Required distribution directories not found/,
    );
  } finally {
    rmSync(tempOut, { recursive: true, force: true });
  }
});

test('parsePkZipEntries validates bounds, CRC-32, and SHA-256 hashes', () => {
  // 1. Buffer length < 22 throws
  assert.throws(() => parsePkZipEntries(Buffer.alloc(20)), /must be a Buffer of at least 22 bytes/);

  // 2. Missing EOCD signature throws
  assert.throws(() => parsePkZipEntries(Buffer.alloc(50)), /Valid PKZip End of Central Directory signature/);

  // 3. Round-trip buildZip and parsePkZipEntries
  const sampleEntries = [
    { path: 'hello.txt', data: 'Hello World!' },
    { path: 'nested/sub.txt', data: 'Nested content' },
  ];
  const zipBuf = buildZip(sampleEntries);
  const parsed = parsePkZipEntries(zipBuf);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'hello.txt');
  assert.equal(parsed[0].data.toString('utf8'), 'Hello World!');
  assert.equal(
    parsed[0].sha256,
    createHash('sha256').update('Hello World!').digest('hex'),
  );

  // 4. Corrupted CRC-32 detection
  const corruptedZip = Buffer.from(zipBuf);
  // Find local header data for hello.txt and flip a byte in compressed data
  // The first LFH starts at 0, data starts at 30 + 'hello.txt'.length = 39
  corruptedZip[40] = corruptedZip[40] ^ 0xff;
  assert.throws(() => parsePkZipEntries(corruptedZip));

  // 5. MAX_ZIP_ENTRIES exceeded check
  const fakeEocd = Buffer.alloc(22);
  fakeEocd.writeUInt32LE(0x06054b50, 0);
  fakeEocd.writeUInt16LE(MAX_ZIP_ENTRIES + 1, 10); // totalEntries > MAX_ZIP_ENTRIES
  fakeEocd.writeUInt32LE(0, 12); // cdSize
  fakeEocd.writeUInt32LE(0, 16); // cdOffset
  assert.throws(() => parsePkZipEntries(fakeEocd), /exceeds max allowed 128 entries/);
});

test('resolveDefaultZipMtime handles SOURCE_DATE_EPOCH and defaults deterministically', () => {
  const origEpoch = process.env.SOURCE_DATE_EPOCH;
  try {
    delete process.env.SOURCE_DATE_EPOCH;
    const defaultDate = resolveDefaultZipMtime();
    assert.equal(defaultDate.toISOString(), DEFAULT_ZIP_MTIME.toISOString());

    process.env.SOURCE_DATE_EPOCH = '1704067200'; // 2024-01-01T00:00:00Z
    const fixedDate = resolveDefaultZipMtime();
    assert.equal(fixedDate.toISOString(), '2024-01-01T00:00:00.000Z');

    process.env.SOURCE_DATE_EPOCH = 'invalid-number';
    assert.throws(() => resolveDefaultZipMtime(), /Invalid SOURCE_DATE_EPOCH/);

    process.env.SOURCE_DATE_EPOCH = '-100';
    assert.throws(() => resolveDefaultZipMtime(), /Invalid SOURCE_DATE_EPOCH/);
  } finally {
    if (origEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = origEpoch;
  }
});

test('dist/sri.json, dist/manifest.json, and dist/SHA256SUMS.txt integrity', () => {
  const sriPath = join(root, 'dist', 'sri.json');
  const manifestPath = join(root, 'dist', 'manifest.json');
  const sumsPath = join(root, 'dist', 'SHA256SUMS.txt');

  assert.ok(existsSync(sriPath), 'dist/sri.json must exist');
  assert.ok(existsSync(manifestPath), 'dist/manifest.json must exist');
  assert.ok(existsSync(sumsPath), 'dist/SHA256SUMS.txt must exist');

  // Verify sri.json
  const sri = JSON.parse(readFileSync(sriPath, 'utf8'));
  assert.equal(sri.package, '@kidthales/tol-palettes');
  assert.ok(typeof sri.version === 'string');
  assert.ok(sri.files && typeof sri.files === 'object');
  assert.ok(sri.files['dist/css/tol.css'], 'dist/sri.json must contain dist/css/tol.css');
  assert.ok(sri.files['dist/js/index.js'], 'dist/sri.json must contain dist/js/index.js');
  assert.ok(sri.files['dist/json/schemes.json'], 'dist/sri.json must contain dist/json/schemes.json');
  for (const [p, meta] of Object.entries(sri.files)) {
    assert.ok(typeof meta.bytes === 'number' && meta.bytes > 0);
    assert.ok(typeof meta.gzipBytes === 'number' && meta.gzipBytes > 0);
    assert.match(meta.integrity, /^sha384-[A-Za-z0-9+/=]+$/);
  }

  // Verify manifest.json
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, '@kidthales/tol-palettes');
  assert.ok(typeof manifest.version === 'string');
  assert.ok(manifest.artifacts && typeof manifest.artifacts === 'object');
  for (const [name, meta] of Object.entries(manifest.artifacts)) {
    assert.match(meta.sha256, /^[0-9a-f]{64}$/);
    assert.ok(typeof meta.size_bytes === 'number' && meta.size_bytes > 0);
  }

  // Verify SHA256SUMS.txt
  const sumsText = readFileSync(sumsPath, 'utf8');
  const lines = sumsText.trim().split(/\r?\n/);

  const expectedAssets = [
    { name: 'LICENSE', file: join(root, 'LICENSE') },
    { name: 'NOTICE', file: join(root, 'NOTICE') },
    { name: 'manifest.json', file: manifestPath },
    { name: 'schemes.json', file: join(root, 'dist', 'json', 'schemes.json') },
    { name: 'sri.json', file: sriPath },
    { name: 'tol-palettes-aseprite.zip', file: join(root, 'dist', 'assets', 'tol-palettes-aseprite.zip') },
    { name: 'tol-palettes-godot.zip', file: join(root, 'dist', 'assets', 'tol-palettes-godot.zip') },
    { name: 'tol-palettes-gpl.zip', file: join(root, 'dist', 'assets', 'tol-palettes-gpl.zip') },
    { name: 'tol.css', file: join(root, 'dist', 'css', 'tol.css') },
    { name: 'tol_palettes.py', file: join(root, 'dist', 'py', 'tol_palettes.py') },
  ];

  assert.equal(
    lines.length,
    expectedAssets.length,
    `SHA256SUMS.txt must cover exactly ${expectedAssets.length} release assets`,
  );

  for (const item of expectedAssets) {
    const line = lines.find((l) => l.endsWith(`  ${item.name}`));
    assert.ok(line, `Missing release asset ${item.name} in SHA256SUMS.txt`);
    const [sha] = line.split(/\s+/);
    assert.match(sha, /^[0-9a-f]{64}$/);
    const actualSha = createHash('sha256').update(readFileSync(item.file)).digest('hex');
    assert.equal(sha, actualSha, `Hash mismatch for ${item.name} in SHA256SUMS.txt`);
  }
});
