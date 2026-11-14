import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

    // Target starting with "./" that escapes package root via "../" or wildcard coalescing
    const outOfRootErrors = auditPackageExports(dir, {
      exports: {
        './escape-dot': './dist/../../outside.js',
        './escape-glob': './../outside/*',
        './escape-coalesce': './*../outside.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(outOfRootErrors.length, 3, `Expected 3 out-of-root errors, got: ${JSON.stringify(outOfRootErrors)}`);
    assert.ok(outOfRootErrors.every((e) => e.includes('resolves outside package root')));

    // Targets containing invalid ".", "..", or "\" path segments (including post-wildcard expansion)
    const invalidSegmentErrors = auditPackageExports(dir, {
      exports: {
        './dot-seg': './dist/./js/index.js',
        './dotdot-coalesce': './dist/*../outside.js',
        './backslash': './dist\\js\\index.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(
      invalidSegmentErrors.length,
      3,
      `Expected 3 invalid-segment errors, got: ${JSON.stringify(invalidSegmentErrors)}`,
    );
    assert.ok(invalidSegmentErrors.every((e) => e.includes('contains invalid path segment')));

    // Empty conditional export maps and empty fallback arrays
    const emptyTargetErrors = auditPackageExports(dir, {
      exports: {
        '.': {},
        './nested-empty': { import: {} },
        './fallback': [],
        './nested-fallback': ['./dist/js/index.js', []],
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(emptyTargetErrors.length, 4, `Expected 4 empty-target errors, got: ${JSON.stringify(emptyTargetErrors)}`);
    assert.equal(emptyTargetErrors.filter((e) => e.includes('empty condition map')).length, 2);
    assert.equal(emptyTargetErrors.filter((e) => e.includes('empty fallback array')).length, 2);

    // Valid wildcard directory export still passes
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './js/*': './dist/js/*',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    // Percent-encoded traversal tokens and node_modules segments (including post-wildcard)
    const encodedAndModulesErrors = auditPackageExports(dir, {
      exports: {
        './encoded-dot': './dist/%2e%2e/outside.js',
        './encoded-glob': './dist/*/%2E%2E/%2foutside.js',
        './encoded-backslash': './dist/%5Coutside.js',
        './encoded-coalesce': './dist/%2*e/index.js',
        './nm-direct': './node_modules/pkg/index.js',
        './nm-glob': './dist/*/node_modules/pkg/index.js',
        './nm-coalesce': './dist/*node_modules/index.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(
      encodedAndModulesErrors.length,
      7,
      `Expected 7 encoded/node_modules segment errors, got: ${JSON.stringify(encodedAndModulesErrors)}`,
    );
    assert.ok(encodedAndModulesErrors.every((e) => e.includes('contains invalid path segment')));

    // Directory vs. regular-file enforcement on non-wildcard and wildcard targets
    writeFileSync(join(dir, 'dist', 'js', 'my_node_modules_note.js'), '', 'utf8');
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './note': './dist/js/my_node_modules_note.js',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    const dirTargetErrors = auditPackageExports(dir, {
      exports: {
        './js': './dist/js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(dirTargetErrors.length, 1);
    assert.ok(dirTargetErrors[0].includes('must resolve to a file'));

    const fileWildcardErrors = auditPackageExports(dir, {
      exports: {
        './file-glob/*': './dist/js/index.js/*',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(fileWildcardErrors.length, 1);
    assert.ok(fileWildcardErrors[0].includes('prefix must resolve to a directory'));

    const throughFileErrors = auditPackageExports(dir, {
      exports: {
        './through-file': './dist/js/index.js/sub.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(throughFileErrors.length, 1);
    assert.ok(throughFileErrors[0].includes('does not exist on disk'));
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

test('auditPackageExports enforces wildcard arity, inline filename-prefix wildcards, and symlink containment', () => {
  withTempRoot((dir) => {
    mkdirSync(join(dir, 'schema'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'icons'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'js'), { recursive: true });
    writeFileSync(join(dir, 'schema', 'scheme.schema.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'dist', 'js', 'index.js'), '', 'utf8');

    // Valid single inline filename-prefix wildcard (parent directory exists) and root-level inline wildcard
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './icons/*': './dist/icons/icon-*.svg',
          './root-*': './root-*.json',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    // Inline wildcard whose parent directory is missing or is a file fails closed
    const missingInlineParentErrors = auditPackageExports(dir, {
      exports: {
        './missing/*': './dist/missing/icon-*.svg',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(missingInlineParentErrors.length, 1);
    assert.ok(missingInlineParentErrors[0].includes('does not exist on disk'));

    const fileInlineParentErrors = auditPackageExports(dir, {
      exports: {
        './file-prefix/*': './dist/js/index.js/icon-*.svg',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(fileInlineParentErrors.length, 1);
    assert.ok(fileInlineParentErrors[0].includes('prefix must resolve to a directory'));

    // Multi-wildcard targets are rejected regardless of directory or inline placement
    const multiWildcardErrors = auditPackageExports(dir, {
      exports: {
        './multi-dir/*': './dist/js/*/sub/*.js',
        './multi-inline/*': './dist/icons/icon-*-*.svg',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(multiWildcardErrors.length, 2, `Expected 2 multi-wildcard errors, got: ${JSON.stringify(multiWildcardErrors)}`);
    assert.ok(multiWildcardErrors.every((e) => e.includes('must not contain more than one "*" wildcard')));

    // Symlink / junction escape outside package root must fail closed; internal symlink stays permitted
    symlinkSync(join(dir, 'dist', 'js'), join(dir, 'dist', 'alias'), 'junction');
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './alias/*': './dist/alias/*',
          './alias-index': './dist/alias/index.js',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );

    withTempRoot((outsideDir) => {
      writeFileSync(join(outsideDir, 'secret.js'), '', 'utf8');
      symlinkSync(outsideDir, join(dir, 'dist', 'escape'), 'junction');

      const symlinkEscapeErrors = auditPackageExports(dir, {
        exports: {
          './escape-file': './dist/escape/secret.js',
          './escape-glob/*': './dist/escape/*',
          './escape-inline/*': './dist/escape/sec-*.js',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      });
      assert.equal(
        symlinkEscapeErrors.length,
        3,
        `Expected 3 symlink escape errors, got: ${JSON.stringify(symlinkEscapeErrors)}`,
      );
      assert.ok(symlinkEscapeErrors.every((e) => e.includes('resolves outside package root via symlink')));
    });
  });
});

test('auditPackageExports enforces subpath/condition key grammar and rejects empty slash segments', () => {
  withTempRoot((dir) => {
    mkdirSync(join(dir, 'schema'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'js'), { recursive: true });
    writeFileSync(join(dir, 'schema', 'scheme.schema.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'dist', 'js', 'index.js'), '', 'utf8');

    // Mixed top-level subpath and condition keys fail closed
    const mixedTopLevelErrors = auditPackageExports(dir, {
      exports: {
        '.': './dist/js/index.js',
        import: './dist/js/index.js',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(
      mixedTopLevelErrors.length,
      1,
      `Expected 1 mixed-key error, got: ${JSON.stringify(mixedTopLevelErrors)}`,
    );
    assert.ok(mixedTopLevelErrors[0].includes('must not mix "."-prefixed subpath keys with condition keys'));

    // Nested condition map with "."-prefixed key fails closed (both under subpath map and top-level condition map)
    const nestedDotKeyErrors = auditPackageExports(dir, {
      exports: {
        '.': {
          './sub': './dist/js/index.js',
        },
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(
      nestedDotKeyErrors.length,
      1,
      `Expected 1 nested condition-key error, got: ${JSON.stringify(nestedDotKeyErrors)}`,
    );
    assert.ok(nestedDotKeyErrors[0].includes('condition key "./sub" must not start with "."'));

    const topLevelConditionErrors = auditPackageExports(dir, {
      exports: {
        import: {
          '.': './dist/js/index.js',
        },
        default: './dist/js/index.js',
      },
    });
    assert.ok(
      topLevelConditionErrors.some((e) => e.includes('condition key "." must not start with "."')),
      `Expected nested "." condition key error, got: ${JSON.stringify(topLevelConditionErrors)}`,
    );
    assert.ok(
      !topLevelConditionErrors.some((e) => e.includes('must not mix')),
      `Did not expect mixed-key error on pure condition map, got: ${JSON.stringify(topLevelConditionErrors)}`,
    );

    // Consecutive slashes and trailing slashes produce empty segments and fail closed
    const emptySegmentErrors = auditPackageExports(dir, {
      exports: {
        './double-slash': './dist//js/index.js',
        './leading-double-slash': './/dist/js/index.js',
        './trailing-slash': './dist/js/',
        './double-slash-glob/*': './dist//*',
        './schema/scheme.schema.json': './schema/scheme.schema.json',
      },
    });
    assert.equal(
      emptySegmentErrors.length,
      4,
      `Expected 4 empty-segment errors, got: ${JSON.stringify(emptySegmentErrors)}`,
    );
    assert.ok(emptySegmentErrors.every((e) => e.includes('contains invalid path segment')));

    // Valid directory/mid-path wildcards still pass without false-positive empty-segment errors
    assert.deepEqual(
      auditPackageExports(dir, {
        exports: {
          './*': './*',
          './js/*': './dist/js/*',
          './mid/*': './dist/*/index.js',
          './schema/scheme.schema.json': './schema/scheme.schema.json',
        },
      }),
      [],
    );
  });
});
