import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes, makeValidator, invariantProblems } from '../tools/validate.mjs';
import { toIdent } from '../tools/generate-js.mjs';
import * as tol from '../dist/js/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceSchemes = loadSchemes().map((x) => x.data);

test('dist/json/schemes.json is schema-valid, attributed and matches data/schemes/*.json', () => {
  const raw = readFileSync(join(root, 'dist', 'json', 'schemes.json'), 'utf8');
  const parsed = JSON.parse(raw);

  assert.match(parsed.$comment, /Paul Tol/);
  assert.match(parsed.$comment, /NOTICE/);
  assert.match(parsed.$comment, /not affiliated with or endorsed by Paul Tol/);

  const validate = makeValidator();
  const ids = Object.keys(parsed.schemes);
  assert.equal(ids.length, sourceSchemes.length);

  for (const src of sourceSchemes) {
    const entry = parsed.schemes[src.id];
    assert.ok(entry, `missing ${src.id} in dist/json/schemes.json`);
    assert.ok(validate(entry), `schema validation failed for ${src.id}`);
    assert.deepEqual(invariantProblems(entry, `${src.id}.json`), []);
    assert.deepEqual(entry, src);
  }
});

test('dist/js/index.js and index.d.ts carry attribution headers and export all 22 schemes', () => {
  const jsText = readFileSync(join(root, 'dist', 'js', 'index.js'), 'utf8');
  const dtsText = readFileSync(join(root, 'dist', 'js', 'index.d.ts'), 'utf8');

  for (const text of [jsText, dtsText]) {
    assert.match(text, /Paul Tol/);
    assert.match(text, /NOTICE/);
    assert.match(text, /not affiliated with or endorsed by Paul Tol/);
  }

  assert.equal(tol.schemeList.length, sourceSchemes.length);
  for (const src of sourceSchemes) {
    const ident = toIdent(src.id);
    assert.deepEqual(tol[ident], src, `named export ${ident} mismatch`);
    assert.deepEqual(tol.get(src.id), src);
    assert.deepEqual(tol.getScheme(src.id), src);
    assert.match(dtsText, new RegExp(`export declare const ${ident}: Scheme;`));
  }

  assert.equal(tol.get('non-existent-scheme'), undefined);
  assert.throws(() => tol.getScheme('non-existent-scheme'), RangeError);
});

test('interpolate matches known reference values for sunset and iridescent', () => {
  // sunset has 11 stops (indices 0..10); exact stop positions t = i / 10 must return the exact knot hex
  const sunset = tol.getScheme('sunset');
  sunset.colors.forEach((c, i) => {
    assert.equal(tol.interpolate('sunset', i / (sunset.colors.length - 1)), c.hex);
  });
  // Midpoint of sunset (11 stops -> index 5 is exact middle t = 0.5)
  assert.equal(tol.interpolate('sunset', 0.5), '#EAECCC');
  // Halfway between stop 0 (#364B9A = 54,75,154) and stop 1 (#4A7BB7 = 74,123,183) at t = 0.05:
  // r = round(54 + 0.5*20) = 64 (0x40), g = round(75 + 0.5*48) = 99 (0x63), b = round(154 + 0.5*29) = 169 (0xA9)
  assert.equal(tol.interpolate('sunset', 0.05), '#4063A9');

  // iridescent has 23 stops (indices 0..22)
  const iridescent = tol.getScheme('iridescent');
  assert.equal(tol.interpolate('iridescent', 0), '#FEFBE9');
  assert.equal(tol.interpolate('iridescent', 1), '#46353A');
  // Middle stop index 11 at t = 11 / 22 = 0.5 is #81C4E7
  assert.equal(tol.interpolate('iridescent', 0.5), '#81C4E7');
  // Quarter stop index 5.5 at t = 0.25 -> halfway between stop 5 (#D0E7CA = 208,231,202) and stop 6 (#C2E3D2 = 194,227,210)
  // r = round(201) = 0xC9, g = round(229) = 0xE5, b = round(206) = 0xCE -> #C9E5CE
  assert.equal(tol.interpolate('iridescent', 0.25), '#C9E5CE');
  assert.equal(iridescent.colors.length, 23);

  // Subrange support on rainbow-smooth (rainbow_PuRd is indices 8..29: #6F4C9B .. #DA2222)
  assert.equal(tol.interpolate('rainbow-smooth', 0, { subrange: 'rainbow_PuRd' }), '#6F4C9B');
  assert.equal(tol.interpolate('rainbow-smooth', 1, { subrange: 'rainbow_PuRd' }), '#DA2222');

  // Clamping and error guards
  assert.equal(tol.interpolate('sunset', -0.5), '#364B9A');
  assert.equal(tol.interpolate('sunset', 1.5), '#A50026');
  assert.throws(() => tol.interpolate('bright', 0.5), TypeError);
  assert.throws(() => tol.interpolate('rainbow-discrete', 0.5), TypeError);
  assert.throws(() => tol.interpolate('sunset', Number.NaN), TypeError);
  assert.throws(() => tol.interpolate('rainbow-smooth', 0.5, { subrange: 'unknown' }), RangeError);
});

test('discreteRainbow and discreteRainbowBad match all 23 lengths of rainbow-discrete', () => {
  const rd = tol.getScheme('rainbow-discrete');
  assert.equal(rd.lut.length, 23);

  for (let n = 1; n <= 23; n++) {
    const colors = tol.discreteRainbow(n);
    assert.equal(colors.length, n);
    const expected = rd.lut[n - 1].map((idx) => rd.colors[idx].hex);
    assert.deepEqual(colors, expected);
    assert.deepEqual(tol.discreteColors('rainbow-discrete', n), expected);

    const bad = tol.discreteRainbowBad(n);
    assert.equal(bad, n === 23 ? '#777777' : '#FFFFFF');
  }

  assert.equal(tol.discreteRainbow(1)[0], '#1965B0');
  assert.throws(() => tol.discreteRainbow(0), RangeError);
  assert.throws(() => tol.discreteRainbow(24), RangeError);
  assert.throws(() => tol.discreteRainbow(2.5), RangeError);
});

test('discreteColors handles discreteIndexes (nightfall) and sample generates evenly spaced stops', () => {
  const nfDiscrete = tol.discreteColors('nightfall');
  assert.equal(nfDiscrete.length, 9);
  assert.equal(nfDiscrete[0], '#125A56');
  assert.equal(nfDiscrete[8], '#A01813');

  const sampled = tol.sample('sunset', 3);
  assert.deepEqual(sampled, ['#364B9A', '#EAECCC', '#A50026']);
});
