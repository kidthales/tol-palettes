import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAll, properties, cssFor } from '../tools/generate-css.mjs';
import { loadSchemes } from '../tools/validate.mjs';

const schemes = loadSchemes().map((x) => x.data);

test('one file per scheme plus a bundle', () => {
  const files = generateAll(schemes);
  assert.equal(files.size, schemes.length + 1);
  assert.ok(files.has('tol.css'));
  for (const s of schemes) assert.ok(files.has(`${s.id}.css`), s.id);
});

test('every colour value appears in its scheme file and the bundle', () => {
  const files = generateAll(schemes);
  const bundle = files.get('tol.css');
  for (const s of schemes) {
    const text = files.get(`${s.id}.css`);
    for (const c of [...s.colors, ...(s.extras ?? [])]) {
      assert.ok(text.includes(c.hex), `${s.id}: ${c.hex}`);
      assert.ok(bundle.includes(c.hex), `bundle ${s.id}: ${c.hex}`);
    }
  }
});

test('property names are unique across the whole bundle', () => {
  const seen = new Map();
  for (const s of schemes) {
    for (const [name] of properties(s)) {
      assert.ok(!seen.has(name), `${name} defined by ${seen.get(name)} and ${s.id}`);
      seen.set(name, s.id);
    }
  }
});

test('names appear only for schemes whose source is the module', () => {
  for (const s of schemes) {
    const named = [...s.colors, ...(s.extras ?? [])].filter((c) => c.name);
    const props = properties(s).map(([k]) => k);
    for (const c of named) assert.ok(props.includes(`--tol-${s.id}-${c.name}`));
    if (!s.source.module) assert.equal(named.length, 0, s.id);
  }
});

test('property values are hex colours or a linear-gradient', () => {
  for (const s of schemes) {
    for (const [k, v] of properties(s)) {
      if (k.endsWith('-gradient')) assert.match(v, /^linear-gradient\(in srgb to right, (#[0-9A-F]{6})(, #[0-9A-F]{6})*\)$/, k);
      else assert.match(v, /^#[0-9A-F]{6}$/, k);
    }
  }
});

test('gradients exist only for schemes meant to be interpolated', () => {
  for (const s of schemes) {
    const hasGradient = properties(s).some(([k]) => k.endsWith('-gradient'));
    assert.equal(hasGradient, s.interpolation !== 'none', s.id);
  }
});

test('discrete rainbow lookup has 276 entries (1+2+...+23)', () => {
  const rd = schemes.find((s) => s.id === 'rainbow-discrete');
  assert.equal(properties(rd).filter(([k]) => /-n\d+-\d+$/.test(k)).length, 276);
});

test('output is deterministic', () => {
  const a = generateAll(schemes);
  const b = generateAll([...schemes].reverse());
  for (const [name, text] of a) assert.equal(b.get(name), text, name);
  assert.equal(cssFor(schemes[0]), cssFor(schemes[0]));
});

test('every file carries the attribution header', () => {
  for (const [name, text] of generateAll(schemes)) {
    assert.match(text, /Paul Tol/, name);
    assert.match(text, /not affiliated with or endorsed by Paul Tol/, name);
    assert.match(text, /See NOTICE/, name);
  }
});
