// Validates every file in data/schemes against schema/scheme.schema.json plus
// cross-field invariants a plain JSON Schema cannot express.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const schemesDir = join(root, 'data', 'schemes');

export function loadSchema() {
  return JSON.parse(readFileSync(join(root, 'schema', 'scheme.schema.json'), 'utf8'));
}

export function loadSchemes() {
  return readdirSync(schemesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(schemesDir, f), 'utf8')) }));
}

/** Returns a list of human-readable problems for one scheme (empty when valid). */
export function invariantProblems(scheme, file) {
  const problems = [];
  const n = scheme.colors.length;
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < n;

  if (file && basename(file, '.json') !== scheme.id) problems.push(`file name does not match id "${scheme.id}"`);

  const named = [...scheme.colors, ...(scheme.extras ?? [])].filter((c) => c.name !== undefined);
  if (named.length > 0 && !scheme.source.module) {
    problems.push('colour names are present but source.module is not: names may only come from the official module');
  }
  const names = named.map((c) => c.name);
  if (new Set(names).size !== names.length) problems.push('duplicate colour names');

  if (scheme.discreteIndexes) {
    if (!scheme.discreteIndexes.every(inRange)) problems.push('discreteIndexes out of range');
    if (scheme.discreteIndexes.some((v, i, a) => i > 0 && v <= a[i - 1])) problems.push('discreteIndexes must be strictly increasing');
  }
  if (scheme.lut) {
    scheme.lut.forEach((row, k) => {
      if (!row.every(inRange)) problems.push(`lut[${k}] has an index out of range`);
      if (row.length !== k + 1) problems.push(`lut[${k}] must contain ${k + 1} indexes (found ${row.length})`);
      if (row.some((v, i) => i > 0 && v <= row[i - 1])) problems.push(`lut[${k}] must be strictly increasing`);
    });
    if (scheme.lutBad) {
      for (const key of Object.keys(scheme.lutBad)) {
        if (!/^[1-9]\d*$/.test(key) || Number(key) > scheme.lut.length) problems.push(`lutBad key "${key}" is not a valid length`);
      }
    }
  } else if (scheme.lutBad) {
    problems.push('lutBad requires lut');
  }
  if (scheme.subranges) {
    for (const r of scheme.subranges) {
      if (!inRange(r.from) || !inRange(r.to) || r.from > r.to) problems.push(`subrange "${r.id}" has invalid bounds`);
    }
    const ids = scheme.subranges.map((r) => r.id);
    if (new Set(ids).size !== ids.length) problems.push('duplicate subrange ids');
  }
  return problems;
}

export function makeValidator() {
  // strictRequired is off because source.anyOf lists required properties declared on the parent object.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, validateFormats: false });
  return ajv.compile(loadSchema());
}

export function validateAll() {
  const validate = makeValidator();
  const results = [];
  for (const { file, data } of loadSchemes()) {
    const problems = [];
    if (!validate(data)) {
      for (const e of validate.errors) problems.push(`${e.instancePath || '/'} ${e.message}`);
    } else {
      problems.push(...invariantProblems(data, file));
    }
    results.push({ file, id: data.id, problems });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = validateAll();
  let failed = 0;
  for (const r of results) {
    if (r.problems.length) {
      failed++;
      console.error(`FAIL ${r.file}`);
      for (const p of r.problems) console.error(`  - ${p}`);
    }
  }
  console.log(`${results.length} scheme file(s) checked, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}
