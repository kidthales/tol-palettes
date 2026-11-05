import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import {
  checkBudgets,
  renderMarkdownReport,
  runBudgetCheck,
  formatBytes,
  formatCap,
  DEFAULT_BUDGETS,
} from '../tools/check-budgets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tol-budgets-test-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('formatBytes and formatCap format byte numbers accurately', () => {
  assert.equal(formatBytes(1024), '1.00 KB (1,024 B)');
  assert.equal(formatBytes(25385), '24.79 KB (25,385 B)');
  assert.equal(formatCap(32 * 1024), '32.00 KB');
});

test('checkBudgets passes on valid repository dist bundles with DEFAULT_BUDGETS', () => {
  const res = checkBudgets(DEFAULT_BUDGETS, root);
  assert.equal(res.allPassed, true);
  assert.equal(res.results.length, DEFAULT_BUDGETS.length);
  for (const r of res.results) {
    assert.equal(r.passed, true);
    assert.equal(r.rawPassed, true);
    assert.equal(r.gzipPassed, true);
    assert.equal(r.brotliPassed, true);
    assert.ok(r.raw > 0);
  }
});

test('checkBudgets flags over-budget raw size failure', () => {
  withTempDir((dir) => {
    const fileRel = 'dist/test-raw.bin';
    const full = join(dir, fileRel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.alloc(1000, 0x41));

    const budgets = [
      {
        path: fileRel,
        maxRaw: 500, // file is 1000 > 500
        maxGzip: 5000,
        maxBrotli: 5000,
      },
    ];

    const res = checkBudgets(budgets, dir);
    assert.equal(res.allPassed, false);
    assert.equal(res.results[0].rawPassed, false);
    assert.equal(res.results[0].passed, false);
  });
});

test('checkBudgets flags over-budget gzip size failure', () => {
  withTempDir((dir) => {
    const fileRel = 'dist/test-gzip.bin';
    const full = join(dir, fileRel);
    mkdirSync(dirname(full), { recursive: true });
    // Random buffer that does not compress well
    const randomBuf = Buffer.alloc(2048);
    for (let i = 0; i < randomBuf.length; i++) randomBuf[i] = (i * 37 + 13) % 256;
    writeFileSync(full, randomBuf);

    const gzipSize = gzipSync(randomBuf, { level: 9 }).length;

    const budgets = [
      {
        path: fileRel,
        maxRaw: 10000,
        maxGzip: gzipSize - 1, // ceil lower than actual gzip
        maxBrotli: 10000,
      },
    ];

    const res = checkBudgets(budgets, dir);
    assert.equal(res.allPassed, false);
    assert.equal(res.results[0].rawPassed, true);
    assert.equal(res.results[0].gzipPassed, false);
    assert.equal(res.results[0].passed, false);
  });
});

test('checkBudgets flags over-budget brotli size failure', () => {
  withTempDir((dir) => {
    const fileRel = 'dist/test-brotli.bin';
    const full = join(dir, fileRel);
    mkdirSync(dirname(full), { recursive: true });
    const randomBuf = Buffer.alloc(2048);
    for (let i = 0; i < randomBuf.length; i++) randomBuf[i] = (i * 47 + 7) % 256;
    writeFileSync(full, randomBuf);

    const brotliSize = brotliCompressSync(randomBuf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;

    const budgets = [
      {
        path: fileRel,
        maxRaw: 10000,
        maxGzip: 10000,
        maxBrotli: brotliSize - 1, // ceil lower than actual brotli
      },
    ];

    const res = checkBudgets(budgets, dir);
    assert.equal(res.allPassed, false);
    assert.equal(res.results[0].brotliPassed, false);
    assert.equal(res.results[0].passed, false);
  });
});

test('checkBudgets passes on exact-limit boundary case', () => {
  withTempDir((dir) => {
    const fileRel = 'dist/test-exact.bin';
    const full = join(dir, fileRel);
    mkdirSync(dirname(full), { recursive: true });
    const buf = Buffer.from('hello world exact boundary');
    writeFileSync(full, buf);

    const raw = buf.length;
    const gzip = gzipSync(buf, { level: 9 }).length;
    const brotli = brotliCompressSync(buf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;

    const budgets = [
      {
        path: fileRel,
        maxRaw: raw,
        maxGzip: gzip,
        maxBrotli: brotli,
      },
    ];

    const res = checkBudgets(budgets, dir);
    assert.equal(res.allPassed, true);
    assert.equal(res.results[0].rawPassed, true);
    assert.equal(res.results[0].gzipPassed, true);
    assert.equal(res.results[0].brotliPassed, true);
    assert.equal(res.results[0].passed, true);
  });
});

test('checkBudgets fails closed on missing file', () => {
  withTempDir((dir) => {
    const budgets = [
      {
        path: 'dist/missing-bundle.js',
        maxRaw: 10000,
        maxGzip: 5000,
        maxBrotli: 4000,
      },
    ];

    const res = checkBudgets(budgets, dir);
    assert.equal(res.allPassed, false);
    assert.equal(res.results[0].passed, false);
    assert.equal(res.results[0].error, 'File does not exist');

    const md = renderMarkdownReport(res);
    assert.match(md, /`dist\/missing-bundle\.js` \| \*Missing\*.*❌ FAIL/);
  });
});

test('renderMarkdownReport emits formatted Markdown table with PASS and FAIL badges', () => {
  const mockResult = {
    allPassed: false,
    results: [
      {
        path: 'dist/pass.css',
        raw: 1024,
        maxRaw: 2048,
        rawPassed: true,
        gzip: 200,
        maxGzip: 500,
        gzipPassed: true,
        brotli: 150,
        maxBrotli: 400,
        brotliPassed: true,
        passed: true,
      },
      {
        path: 'dist/fail.css',
        raw: 5000,
        maxRaw: 2000,
        rawPassed: false,
        gzip: 1500,
        maxGzip: 1000,
        gzipPassed: false,
        brotli: 1200,
        maxBrotli: 800,
        brotliPassed: false,
        passed: false,
      },
    ],
  };

  const md = renderMarkdownReport(mockResult);
  assert.match(md, /### Bundle Size Budgets Report/);
  assert.match(md, /`dist\/pass\.css`.*✅ PASS/);
  assert.match(md, /`dist\/fail\.css`.*❌ FAIL/);
});

test('runBudgetCheck writes summary to GITHUB_STEP_SUMMARY when variable is set', () => {
  withTempDir((dir) => {
    const summaryFile = join(dir, 'step_summary.md');
    const oldSummary = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_STEP_SUMMARY = summaryFile;

    try {
      const res = runBudgetCheck({ baseDir: root, budgets: DEFAULT_BUDGETS });
      assert.equal(res.allPassed, true);
      assert.ok(existsSync(summaryFile));
      const content = readFileSync(summaryFile, 'utf8');
      assert.match(content, /### Bundle Size Budgets Report/);
      assert.match(content, /dist\/css\/tol\.css/);
    } finally {
      if (oldSummary === undefined) {
        delete process.env.GITHUB_STEP_SUMMARY;
      } else {
        process.env.GITHUB_STEP_SUMMARY = oldSummary;
      }
    }
  });
});
