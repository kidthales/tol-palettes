import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditHostedSchema, auditPackageExports, EXPECTED_SCHEMA_ID } from '../tools/lint.mjs';

function withTempRoot(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tol_lint_test_'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('auditPackageExports passes for valid schema export and fails closed on missing/mismatched exports', () => {
  withTempRoot((dir) => {
    mkdirSync(join(dir, 'schema'), { recursive: true });
    writeFileSync(join(dir, 'schema', 'scheme.schema.json'), '{}', 'utf8');

    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    const missingExportErrors = auditPackageExports(dir, { exports: {} });
    assert.ok(
      missingExportErrors.some((e) => e.includes('./schema/scheme.schema.json')),
      `Expected schema export error, got: ${JSON.stringify(missingExportErrors)}`,
    );

    const wrongTargetErrors = auditPackageExports(dir, {
      exports: {
        './schema/scheme.schema.json': './schema/other.schema.json',
      },
    });
    assert.ok(wrongTargetErrors.some((e) => e.includes('does not exist on disk')));
    assert.ok(wrongTargetErrors.some((e) => e.includes('must map "./schema/scheme.schema.json"')));
  });
});

test('auditPackageExports handles null subpath restrictions, nested conditional exports, and rejects out-of-root targets', () => {
  withTempRoot((dir) => {
    mkdirSync(join(dir, 'schema'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'js'), { recursive: true });
    writeFileSync(join(dir, 'schema', 'scheme.schema.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'dist', 'js', 'index.js'), '', 'utf8');
    writeFileSync(join(dir, 'dist', 'js', 'index.d.ts'), '', 'utf8');

    // Valid null subpath restriction + nested conditional exports + fallback array
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          '.': {
            import: {
              types: './dist/js/index.d.ts',
              default: './dist/js/index.js',
            },
          },
          './fallback': ['./dist/js/index.js', null],
          './internal/*': null,
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    // Nested missing target inside conditional export map
    const nestedMissingErrors = auditPackageExports(dir, {
      exports: {
        '.': {
          import: {
            types: './dist/js/missing.d.ts',
            default: './dist/js/index.js',
          },
        },
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.ok(
      nestedMissingErrors.some((e) => e.includes('./dist/js/missing.d.ts') && e.includes('does not exist on disk')),
      `Expected missing nested target error, got: ${JSON.stringify(nestedMissingErrors)}`,
    );

    // Target omitting leading "./" prefix (direct ../ traversal)
    const missingPrefixErrors = auditPackageExports(dir, {
      exports: {
        './escape': '../outside.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.ok(
      missingPrefixErrors.some((e) => e.includes('must start with "./"')),
      `Expected "./" prefix error, got: ${JSON.stringify(missingPrefixErrors)}`,
    );

    // Target starting with "./" that escapes package root via "../"
    const outOfRootErrors = auditPackageExports(dir, {
      exports: {
        './escape-dot': './dist/../../outside.js',
        './escape-glob': './../outside/*',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(outOfRootErrors.length, 2, `Expected 2 out-of-root errors, got: ${JSON.stringify(outOfRootErrors)}`);
    assert.ok(outOfRootErrors.every((e) => e.includes('resolves outside package root')));
  });
});

test('auditHostedSchema passes on matching $id/bytes and fails closed without crashing on missing or mismatched schemas', () => {
  withTempRoot((dir) => {
    const srcDir = join(dir, 'schema');
    const gallerySchemaDir = join(dir, 'dist', 'gallery', 'schema');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(gallerySchemaDir, { recursive: true });

    const validSchema = JSON.stringify({ $id: EXPECTED_SCHEMA_ID }, null, 2) + '\n';
    const srcPath = join(srcDir, 'scheme.schema.json');
    const galleryPath = join(gallerySchemaDir, 'scheme.schema.json');

    // Happy path: matching $id and byte-identical gallery copy
    writeFileSync(srcPath, validSchema, 'utf8');
    writeFileSync(galleryPath, validSchema, 'utf8');
    assert.deepEqual(auditHostedSchema(dir), []);

    // Wrong $id in source schema
    const wrongIdSchema = JSON.stringify({ $id: 'https://example.com/wrong.json' }) + '\n';
    writeFileSync(srcPath, wrongIdSchema, 'utf8');
    writeFileSync(galleryPath, wrongIdSchema, 'utf8');
    const wrongIdErrors = auditHostedSchema(dir);
    assert.ok(wrongIdErrors.some((e) => e.includes('$id must be')));

    // Invalid JSON in source schema
    writeFileSync(srcPath, '{invalid json', 'utf8');
    writeFileSync(galleryPath, '{invalid json', 'utf8');
    const parseErrors = auditHostedSchema(dir);
    assert.ok(parseErrors.some((e) => e.includes('Failed to parse schema/scheme.schema.json')));

    // Byte mismatch between source schema and gallery copy
    writeFileSync(srcPath, validSchema, 'utf8');
    writeFileSync(galleryPath, validSchema + ' ', 'utf8');
    const mismatchErrors = auditHostedSchema(dir);
    assert.ok(mismatchErrors.some((e) => e.includes('not byte-identical')));

    // Missing gallery schema copy
    rmSync(galleryPath);
    const missingGalleryErrors = auditHostedSchema(dir);
    assert.ok(missingGalleryErrors.some((e) => e.includes('Missing dist/gallery/schema/scheme.schema.json')));

    // Missing source schema while stale gallery copy exists (must not throw ENOENT)
    writeFileSync(galleryPath, validSchema, 'utf8');
    rmSync(srcPath);
    const missingSrcErrors = auditHostedSchema(dir);
    assert.equal(missingSrcErrors.length, 1);
    assert.match(missingSrcErrors[0], /Failed to parse schema\/scheme\.schema\.json/);

    // Directory-corrupted gallerySchemaPath (must record [gallery] EISDIR diagnostic instead of throwing)
    writeFileSync(srcPath, validSchema, 'utf8');
    rmSync(galleryPath);
    mkdirSync(galleryPath);
    const eisdirErrors = auditHostedSchema(dir);
    assert.equal(eisdirErrors.length, 1);
    assert.match(eisdirErrors[0], /^\[gallery\] Failed to read dist\/gallery\/schema\/scheme\.schema\.json: .*EISDIR/);
  });
});
