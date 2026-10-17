import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from '../tools/validate.mjs';
import { rgbToHex } from '../tools/generate-js.mjs';
import { generateAllGame } from '../tools/generate-game.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemes = loadSchemes().map((x) => x.data);

function parseGpl(text) {
  const lines = text.trimEnd().split('\n');
  assert.equal(lines[0], 'GIMP Palette');
  const nameMatch = lines[1].match(/^Name:\s*(.+)$/);
  assert.ok(nameMatch, 'missing Name header in .gpl');
  const colMatch = lines[2].match(/^Columns:\s*(\d+)$/);
  assert.ok(colMatch, 'missing Columns header in .gpl');

  const comments = [];
  const entries = [];
  for (const line of lines.slice(3)) {
    if (line.startsWith('#')) {
      comments.push(line);
      continue;
    }
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\t(.+)$/);
    assert.ok(m, `malformed .gpl colour row: "${line}"`);
    const [, r, g, b, label] = m;
    entries.push({
      hex: rgbToHex(Number(r), Number(g), Number(b)),
      label,
    });
  }
  return { name: nameMatch[1], columns: Number(colMatch[1]), comments: comments.join('\n'), entries };
}

test('dist/gpl and dist/aseprite contain valid, attributed .gpl files for all 22 schemes', () => {
  const gplDir = join(root, 'dist', 'gpl');
  const aseDir = join(root, 'dist', 'aseprite');
  assert.equal(readdirSync(gplDir).length, schemes.length);
  assert.equal(readdirSync(aseDir).length, schemes.length);

  for (const s of schemes) {
    const expectedAll = [...s.colors, ...(s.extras ?? [])];
    for (const dir of [gplDir, aseDir]) {
      const raw = readFileSync(join(dir, `${s.id}.gpl`), 'utf8');
      const parsed = parseGpl(raw);
      assert.equal(parsed.name, `tol-${s.id}`);
      assert.match(parsed.comments, /Paul Tol/);
      assert.match(parsed.comments, /NOTICE/);
      assert.match(parsed.comments, /not affiliated with or endorsed by Paul Tol/);
      assert.equal(parsed.entries.length, expectedAll.length);

      parsed.entries.forEach((entry, i) => {
        const srcColor = expectedAll[i];
        assert.equal(entry.hex, srcColor.hex);
        if (srcColor.name) {
          assert.equal(entry.label, srcColor.name);
        } else {
          // No invented colour names: label must be the hex value itself
          assert.equal(entry.label, srcColor.hex);
        }
      });
    }
  }
});

test('dist/godot contains valid ColorPalette .tres files and tol_palettes.gd with no invented names', () => {
  const godotDir = join(root, 'dist', 'godot');
  const { godotFiles } = generateAllGame(schemes);

  for (const [name, expectedText] of godotFiles) {
    const onDisk = readFileSync(join(godotDir, name), 'utf8');
    assert.equal(onDisk, expectedText, `drift in dist/godot/${name}`);
    assert.match(onDisk, /Paul Tol/);
    assert.match(onDisk, /NOTICE/);
    assert.match(onDisk, /not affiliated with or endorsed by Paul Tol/);
  }

  for (const s of schemes) {
    const tres = readFileSync(join(godotDir, `${s.id}.tres`), 'utf8');
    assert.match(tres, /^\[gd_resource type="ColorPalette" format=3\]/);
    const m = tres.match(/colors = PackedColorArray\(([^)]+)\)/);
    assert.ok(m, `missing PackedColorArray in ${s.id}.tres`);
    const nums = m[1].split(',').map((x) => Number(x.trim()));
    const expectedAll = [...s.colors, ...(s.extras ?? [])];
    assert.equal(nums.length, expectedAll.length * 4);
    for (let i = 0; i < expectedAll.length; i++) {
      const r = Math.round(nums[i * 4] * 255);
      const g = Math.round(nums[i * 4 + 1] * 255);
      const b = Math.round(nums[i * 4 + 2] * 255);
      const a = nums[i * 4 + 3];
      assert.equal(rgbToHex(r, g, b), expectedAll[i].hex);
      assert.equal(a, 1);
    }
  }

  const gd = readFileSync(join(godotDir, 'tol_palettes.gd'), 'utf8');
  assert.match(gd, /class_name TolPalettes/);
  // Named constants exist only for the 6 official module qualitative sets
  const constMatches = [...gd.matchAll(/^const ([A-Z0-9_]+) := Color\("(#[0-9A-F]{6})"\)/gm)];
  const totalNamedInSource = schemes.reduce(
    (sum, s) => sum + [...s.colors, ...(s.extras ?? [])].filter((c) => c.name).length,
    0,
  );
  assert.equal(constMatches.length, totalNamedInSource);

  // Site-only schemes (dark, pale, groundcover, incandescent, banded) must not have any const prefixes
  for (const unnamed of ['DARK_', 'PALE_', 'GROUNDCOVER_', 'INCANDESCENT_', 'BANDED_']) {
    assert.ok(!constMatches.some(([, name]) => name.startsWith(unnamed)), `unexpected constant starting with ${unnamed}`);
  }
});
