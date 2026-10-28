import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { loadSchemes } from '../tools/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemes = loadSchemes().map((x) => x.data);

/**
 * Parses a ZIP archive buffer and returns an array of entries with paths and uncompressed data.
 * @param {Buffer} buffer
 */
function readZipEntries(buffer) {
  // Find End of Central Directory record (0x06054b50)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, 'EOCD signature (0x06054b50) not found in zip');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let offset = cdOffset;
  const entries = [];
  for (let i = 0; i < entryCount; i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'Invalid central directory record signature');
    const compression = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const pathLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const path = buffer.toString('utf8', offset + 46, offset + 46 + pathLen);
    offset += 46 + pathLen + extraLen + commentLen;

    assert.equal(buffer.readUInt32LE(localHeaderOffset), 0x04034b50, 'Invalid local header signature');
    const lPathLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lPathLen + lExtraLen;
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (compression === 0) {
      data = rawData;
    } else if (compression === 8) {
      data = inflateRawSync(rawData);
    } else {
      throw new Error(`Unsupported compression method: ${compression}`);
    }

    assert.equal(data.length, uncompressedSize, `Uncompressed size mismatch for ${path}`);
    entries.push({ path, data, uncompressedSize, compressedSize, crc });
  }

  return entries;
}

test('dist/assets contains valid zip bundles for Godot, Aseprite, and GPL', () => {
  const assetsDir = join(root, 'dist', 'assets');
  const godotZipPath = join(assetsDir, 'tol-palettes-godot.zip');
  const asepriteZipPath = join(assetsDir, 'tol-palettes-aseprite.zip');
  const gplZipPath = join(assetsDir, 'tol-palettes-gpl.zip');

  assert.ok(existsSync(godotZipPath), 'tol-palettes-godot.zip must exist');
  assert.ok(existsSync(asepriteZipPath), 'tol-palettes-aseprite.zip must exist');
  assert.ok(existsSync(gplZipPath), 'tol-palettes-gpl.zip must exist');

  // 1. Verify Godot Zip
  const godotBuffer = readFileSync(godotZipPath);
  const godotEntries = readZipEntries(godotBuffer);
  // Expected: 22 .tres + 1 .gd + 1 plugin.cfg = 24 files
  assert.equal(godotEntries.length, 24, 'Godot zip must contain exactly 24 files (22 tres + 1 gd + plugin.cfg)');

  const godotPaths = godotEntries.map((e) => e.path);
  for (const p of godotPaths) {
    assert.ok(p.startsWith('addons/tol_palettes/'), `Godot path must start with addons/tol_palettes/: ${p}`);
  }

  assert.ok(godotPaths.includes('addons/tol_palettes/plugin.cfg'), 'plugin.cfg must be present in Godot zip');
  assert.ok(godotPaths.includes('addons/tol_palettes/tol_palettes.gd'), 'tol_palettes.gd must be present in Godot zip');
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
  const aseEntries = readZipEntries(aseBuffer);
  assert.equal(aseEntries.length, 22, 'Aseprite zip must contain 22 .gpl files');
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
  const gplEntries = readZipEntries(gplBuffer);
  assert.equal(gplEntries.length, 22, 'GPL zip must contain 22 .gpl files');
  for (const s of schemes) {
    const entry = gplEntries.find((e) => e.path === `${s.id}.gpl`);
    assert.ok(entry, `GPL zip missing ${s.id}.gpl`);
    const text = entry.data.toString('utf8');
    assert.match(text, /GIMP Palette/);
    assert.match(text, /Paul Tol/);
    assert.ok(!text.includes('Aseprite-compatible'), 'Standard GPL must not have Aseprite comment line');
  }
});
