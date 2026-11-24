import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes, makeValidator, invariantProblems } from '../tools/validate.mjs';
import { toIdent, rgbToHex as genRgbToHex, hexToRgb as genHexToRgb } from '../tools/generate-js.mjs';
import * as tol from '../dist/js/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceSchemes = loadSchemes().map((x) => x.data);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function assertDeepFrozen(value, path = 'root') {
  if (value === null || typeof value !== 'object') {
    return;
  }
  assert.equal(Object.isFrozen(value), true, `Expected ${path} to be frozen`);
  for (const key of Object.keys(value)) {
    assertDeepFrozen(value[key], `${path}.${key}`);
  }
}

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
  assert.throws(
    () => tol.getScheme('non-existent-scheme'),
    /^RangeError: Unknown palette scheme: non-existent-scheme$/,
  );
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

test('exported schemes, scheme map, and schemeList are deeply frozen', () => {
  assertDeepFrozen(tol.schemes, 'tol.schemes');
  assertDeepFrozen(tol.schemeList, 'tol.schemeList');
  for (const src of sourceSchemes) {
    const ident = toIdent(src.id);
    assertDeepFrozen(tol[ident], `tol.${ident}`);
  }

  assert.throws(() => {
    tol.bright.id = 'mutated';
  }, TypeError);
  assert.throws(() => {
    tol.bright.colors.push({ hex: '#000000' });
  }, TypeError);
  assert.throws(() => {
    tol.bright.colors[0].hex = '#000000';
  }, TypeError);
  assert.throws(() => {
    tol.bright.extras[0].hex = '#111111';
  }, TypeError);
  assert.throws(() => {
    tol.bright.source.retrieved = '2099-01-01';
  }, TypeError);
  assert.throws(() => {
    tol.rainbowDiscrete.lut[0].push(99);
  }, TypeError);
  assert.throws(() => {
    tol.rainbowDiscrete.lutBad['23'] = '#000000';
  }, TypeError);
  assert.throws(() => {
    tol.rainbowSmooth.subranges[0].from = 99;
  }, TypeError);
  assert.throws(() => {
    tol.schemes.bright = tol.muted;
  }, TypeError);
  assert.throws(() => {
    tol.schemeList.push(tol.bright);
  }, TypeError);
});

test('getNamed resolves named colours across colors and extras and rejects unknown or invalid inputs', () => {
  const namedSchemes = sourceSchemes.filter((s) => s.colors.some((c) => typeof c.name === 'string'));
  assert.equal(namedSchemes.length, 6);

  for (const src of namedSchemes) {
    const schemeObj = tol[toIdent(src.id)];
    for (const c of [...src.colors, ...(src.extras ?? [])]) {
      assert.equal(tol.getNamed(src.id, c.name), c.hex);
      assert.equal(tol.getNamed(schemeObj, c.name), c.hex);
    }
  }

  // Explicitly verify extras lookup
  assert.equal(tol.getNamed('bright', 'black'), '#000000');
  assert.equal(tol.getNamed('muted', 'pale_grey'), '#DDDDDD');
  assert.equal(tol.getNamed(tol.light, 'black'), '#000000');

  // Custom scheme object with colors + extras
  const custom = {
    id: 'custom',
    colors: [{ hex: '#112233', name: 'primary' }],
    extras: [{ hex: '#445566', name: 'accent' }],
  };
  assert.equal(tol.getNamed(custom, 'primary'), '#112233');
  assert.equal(tol.getNamed(custom, 'accent'), '#445566');

  // Unknown scheme or unknown name -> RangeError
  assert.throws(() => tol.getNamed('non-existent-scheme', 'blue'), RangeError);
  assert.throws(() => tol.getNamed('bright', 'magenta'), RangeError);
  assert.throws(() => tol.getNamed('bright', ''), RangeError);
  assert.throws(() => tol.getNamed('bright', '__proto__'), RangeError);
  assert.throws(() => tol.getNamed('bright', 'toString'), RangeError);
  assert.throws(() => tol.getNamed('sunset', 'blue'), RangeError);
  assert.throws(() => tol.getNamed('dark', 'blue'), RangeError);

  // Invalid schemeOrId or non-string name -> TypeError
  for (const badScheme of [null, undefined, 42, true, [], {}, { colors: [] }]) {
    assert.throws(() => tol.getNamed(badScheme, 'blue'), TypeError);
  }
  for (const badName of [undefined, null, 123, true, {}, ['blue']]) {
    assert.throws(() => tol.getNamed('bright', badName), TypeError);
  }
});

test('strict input guards reject invalid schemes, non-finite RGB, and invalid discrete lengths', () => {
  // getScheme: reject non-strings, arrays, and objects without non-empty colors arrays
  for (const badScheme of [null, undefined, 0, 42, true, false, Symbol('s'), [], [{}], {}, { colors: [] }, { colors: 'bad' }]) {
    assert.throws(() => tol.getScheme(badScheme), TypeError);
  }
  assert.throws(() => tol.getScheme(''), RangeError);
  assert.throws(() => tol.getScheme('non-existent'), RangeError);

  const customScheme = { id: 'custom', colors: [{ hex: '#123456' }] };
  assert.equal(tol.getScheme(customScheme), customScheme);

  // hexToRgb (runtime + generator): reject non-strings and malformed hex strings
  for (const fn of [tol.hexToRgb, genHexToRgb]) {
    for (const badHex of [null, undefined, 123, {}, '#FFF', '4477AA', '#GGGGGG', '#4477AAFF']) {
      assert.throws(() => fn(badHex), TypeError);
    }
  }

  // rgbToHex (runtime + generator): reject NaN, Infinity, -Infinity, and non-numbers; clamp finite values
  for (const fn of [tol.rgbToHex, genRgbToHex]) {
    for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '255', null, undefined, {}]) {
      assert.throws(() => fn(badVal, 0, 0), TypeError);
      assert.throws(() => fn(0, badVal, 0), TypeError);
      assert.throws(() => fn(0, 0, badVal), TypeError);
    }
    assert.equal(fn(-10, 300, 127.6), '#00FF80');
  }

  // interpolate & sample negative inputs
  for (const badT of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0.5', null, undefined]) {
    assert.throws(() => tol.interpolate('sunset', badT), TypeError);
  }
  assert.throws(() => tol.interpolate(null, 0.5), TypeError);
  assert.throws(() => tol.interpolate('unknown', 0.5), RangeError);

  for (const badCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined]) {
    assert.throws(() => tol.sample('sunset', badCount), RangeError);
  }
  assert.deepEqual(tol.sample('sunset', 1), ['#EAECCC']);

  // discreteRainbowBad negative inputs
  for (const badN of [0, -1, 24, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) {
    assert.throws(() => tol.discreteRainbowBad(badN), RangeError);
  }

  // discreteColors: enforce LUT-only integer n, reject n !== undefined on non-LUT schemes
  assert.equal(tol.discreteColors('rainbow-discrete').length, 23);
  for (const badLutN of [0, -1, 24, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '5', null]) {
    assert.throws(() => tol.discreteColors('rainbow-discrete', badLutN), RangeError);
  }
  for (const nonLutId of ['bright', 'sunset', 'nightfall']) {
    for (const unexpectedN of [3, 0, null, '3']) {
      assert.throws(() => tol.discreteColors(nonLutId, unexpectedN), RangeError);
    }
  }
  assert.throws(() => tol.discreteColors(null), TypeError);
  assert.throws(() => tol.discreteColors('unknown'), RangeError);
});

test('dist/js/index.js preserves single-palette bundler tree-shaking invariants', () => {
  assert.equal(pkg.sideEffects, false, 'package.json must declare "sideEffects": false');

  const jsText = readFileSync(join(root, 'dist', 'js', 'index.js'), 'utf8');
  assert.match(jsText, /^function freeze\(/m, 'freeze helper must be declared internally');
  assert.doesNotMatch(jsText, /^export\s+function\s+freeze\b/m, 'freeze helper must not be exported');

  // All 22 scheme constants, schemes, and schemeList must use /* @__PURE__ */ freeze(...)
  for (const src of sourceSchemes) {
    const ident = toIdent(src.id);
    const declRe = new RegExp(`^export const ${ident} = \\/\\* @__PURE__ \\*\\/ freeze\\(\\{`, 'm');
    assert.match(jsText, declRe, `Missing /* @__PURE__ */ annotation on scheme constant ${ident}`);
  }
  assert.match(jsText, /^export const schemes = \/\* @__PURE__ \*\/ freeze\(\{/m);
  assert.match(jsText, /^export const schemeList = \/\* @__PURE__ \*\/ freeze\(\[/m);

  // Every top-level freeze(...) call must be preceded by /* @__PURE__ */
  const allFreezeCalls = jsText.match(/freeze\(/g) ?? [];
  const pureFreezeCalls = jsText.match(/\/\* @__PURE__ \*\/ freeze\(/g) ?? [];
  // 1 declaration ("function freeze(") + 2 recursive calls inside freeze() + 24 annotated top-level exports = 27
  assert.equal(pureFreezeCalls.length, sourceSchemes.length + 2);
  assert.equal(allFreezeCalls.length, sourceSchemes.length + 2 + 3);

  // Verify each exported scheme constant initializer is self-contained (no references to other schemes)
  for (const src of sourceSchemes) {
    const ident = toIdent(src.id);
    const startMarker = `export const ${ident} = /* @__PURE__ */ freeze(`;
    const startIdx = jsText.indexOf(startMarker);
    assert.notEqual(startIdx, -1, `Missing declaration for ${ident}`);
    const endIdx = jsText.indexOf('\n});', startIdx);
    assert.notEqual(endIdx, -1, `Unterminated declaration for ${ident}`);
    const jsonPayload = jsText.slice(startIdx + startMarker.length, endIdx + 2);
    assert.deepEqual(JSON.parse(jsonPayload), src, `Self-contained JSON payload mismatch for ${ident}`);
  }

  // Verify zero top-level side-effect statements outside function/export declarations
  let depth = 0;
  let inHeaderComment = false;
  for (const line of jsText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (inHeaderComment) {
      if (trimmed.includes('*/')) inHeaderComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inHeaderComment = true;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
    if (depth === 0) {
      assert.match(
        line,
        /^(?:function freeze\(|export const [a-zA-Z0-9_]+ = \/\* @__PURE__ \*\/ freeze\(|export function [a-zA-Z0-9_]+\()/,
        `Unexpected top-level statement in dist/js/index.js: ${line}`,
      );
    }
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
    }
  }
  assert.equal(depth, 0, 'Bracket depth must return to 0 at EOF');

  const dtsText = readFileSync(join(root, 'dist', 'js', 'index.d.ts'), 'utf8');
  assert.match(dtsText, /export declare function getNamed\(/);
});
