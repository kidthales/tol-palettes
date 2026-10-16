import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAll, invariantProblems, loadSchemes } from '../tools/validate.mjs';

test('every scheme file passes the JSON Schema and invariants', () => {
  const results = validateAll();
  assert.ok(results.length > 0, 'no scheme files found');
  const failed = results.filter((r) => r.problems.length);
  assert.deepEqual(failed, []);
});

test('hex values are uppercase #RRGGBB everywhere', () => {
  for (const { file, data } of loadSchemes()) {
    const all = [...data.colors, ...(data.extras ?? [])].map((c) => c.hex);
    if (data.bad) all.push(data.bad);
    for (const r of data.subranges ?? []) if (r.bad) all.push(r.bad);
    for (const h of Object.values(data.lutBad ?? {})) all.push(h);
    for (const h of all) assert.match(h, /^#[0-9A-F]{6}$/, `${file}: ${h}`);
  }
});

test('colour names only appear when the official module is the source', () => {
  for (const { file, data } of loadSchemes()) {
    const named = [...data.colors, ...(data.extras ?? [])].some((c) => c.name !== undefined);
    if (named) assert.ok(data.source.module, `${file} has names without source.module`);
  }
  // site-only schemes must never carry names
  for (const { file, data } of loadSchemes()) {
    if (!data.source.module) {
      for (const c of data.colors) assert.equal(c.name, undefined, `${file} has an invented name`);
    }
  }
});

test('discrete rainbow has 23 rows and every row has the right length', () => {
  const rd = loadSchemes().find((s) => s.data.id === 'rainbow-discrete').data;
  assert.equal(rd.lut.length, 23);
  rd.lut.forEach((row, k) => assert.equal(row.length, k + 1));
  assert.equal(rd.colors.length, 29);
  assert.equal(rd.lutBad['23'], '#777777');
});

test('invariant checker rejects bad data', () => {
  const base = { id: 'x', kind: 'qualitative', colors: [{ hex: '#000000' }, { hex: '#FFFFFF' }], interpolation: 'none', source: { siteFigure: 'fig:x', retrieved: '2026-01-01' } };
  assert.deepEqual(invariantProblems(base, 'x.json'), []);
  assert.ok(invariantProblems({ ...base, colors: [{ hex: '#000000', name: 'black' }] }, 'x.json').some((p) => /names/.test(p)));
  assert.ok(invariantProblems(base, 'y.json').some((p) => /file name/.test(p)));
  assert.ok(invariantProblems({ ...base, discreteIndexes: [0, 5] }, 'x.json').some((p) => /range/.test(p)));
  assert.ok(invariantProblems({ ...base, subranges: [{ id: 'a', from: 1, to: 0 }] }, 'x.json').some((p) => /bounds/.test(p)));
  assert.ok(invariantProblems({ ...base, lutBad: { 1: '#000000' } }, 'x.json').some((p) => /requires lut/.test(p)));
});

test('schema rejects malformed scheme objects', async () => {
  const { makeValidator } = await import('../tools/validate.mjs');
  const validate = makeValidator();
  const ok = { id: 'ok', kind: 'special', colors: [{ hex: '#ABCDEF' }], interpolation: 'none', source: { siteFigure: 'fig:x', retrieved: '2026-01-01' } };
  assert.equal(validate(ok), true);
  assert.equal(validate({ ...ok, colors: [{ hex: '#abcdef' }] }), false, 'lowercase hex');
  assert.equal(validate({ ...ok, colors: [{ hex: '#ABCDEF', name: '' }] }), false, 'empty name');
  assert.equal(validate({ ...ok, id: 'Bad Id' }), false, 'bad id');
  assert.equal(validate({ ...ok, kind: 'other' }), false, 'bad kind');
  assert.equal(validate({ ...ok, source: { retrieved: '2026-01-01' } }), false, 'no source reference');
  assert.equal(validate({ ...ok, extra: 1 }), false, 'additional property');
});
