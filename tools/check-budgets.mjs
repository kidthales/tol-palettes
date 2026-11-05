// Enforces raw, gzip (level 9), and brotli (quality 11) size ceilings across primary dist/ bundles.
// Emits a detailed terminal table and writes a Markdown report to $GITHUB_STEP_SUMMARY.

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_BUDGETS = [
  {
    path: 'dist/css/tol.css',
    maxRaw: 32 * 1024,
    maxGzip: 6 * 1024,
    maxBrotli: 4.5 * 1024,
  },
  {
    path: 'dist/js/index.js',
    maxRaw: 35 * 1024,
    maxGzip: 7 * 1024,
    maxBrotli: 5.5 * 1024,
  },
  {
    path: 'dist/json/schemes.json',
    maxRaw: 35 * 1024,
    maxGzip: 5 * 1024,
    maxBrotli: 4 * 1024,
  },
  {
    path: 'dist/py/tol_palettes.py',
    maxRaw: 35 * 1024,
    maxGzip: 7 * 1024,
    maxBrotli: 5.5 * 1024,
  },
  {
    path: 'dist/gallery/index.html',
    maxRaw: 320 * 1024,
    maxGzip: 26 * 1024,
    maxBrotli: 18 * 1024,
  },
  {
    path: 'dist/gallery/gallery.js',
    maxRaw: 5 * 1024,
    maxGzip: 2 * 1024,
    maxBrotli: 1.5 * 1024,
  },
];

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB (${bytes.toLocaleString('en-US')} B)`;
}

export function formatCap(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function checkBudgets(budgets = DEFAULT_BUDGETS, baseDir = root) {
  const results = [];
  let allPassed = true;

  for (const b of budgets) {
    const fullPath = join(baseDir, b.path);
    if (!existsSync(fullPath)) {
      results.push({
        path: b.path,
        error: 'File does not exist',
        passed: false,
      });
      allPassed = false;
      continue;
    }

    const buf = readFileSync(fullPath);
    const raw = buf.length;
    const gzip = gzipSync(buf, { level: 9 }).length;
    const brotli = brotliCompressSync(buf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;

    const rawPassed = raw <= b.maxRaw;
    const gzipPassed = gzip <= b.maxGzip;
    const brotliPassed = brotli <= b.maxBrotli;
    const passed = rawPassed && gzipPassed && brotliPassed;

    if (!passed) {
      allPassed = false;
    }

    results.push({
      path: b.path,
      raw,
      maxRaw: b.maxRaw,
      rawPassed,
      gzip,
      maxGzip: b.maxGzip,
      gzipPassed,
      brotli,
      maxBrotli: b.maxBrotli,
      brotliPassed,
      passed,
    });
  }

  return { results, allPassed };
}

export function renderMarkdownReport(checkResult) {
  const lines = [
    '### Bundle Size Budgets Report',
    '',
    '| Bundle | Raw Size | Raw Budget | Gzip (L9) | Gzip Budget | Brotli (Q11) | Brotli Budget | Status |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const r of checkResult.results) {
    if (r.error) {
      lines.push(`| \`${r.path}\` | *Missing* | - | - | - | - | - | ❌ FAIL |`);
    } else {
      const status = r.passed ? '✅ PASS' : '❌ FAIL';
      lines.push(
        `| \`${r.path}\` | ${formatBytes(r.raw)} | ${formatCap(r.maxRaw)} | ${formatBytes(r.gzip)} | ${formatCap(r.maxGzip)} | ${formatBytes(r.brotli)} | ${formatCap(r.maxBrotli)} | ${status} |`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function runBudgetCheck(opts = {}) {
  const baseDir = opts.baseDir || root;
  const budgets = opts.budgets || DEFAULT_BUDGETS;
  const checkResult = checkBudgets(budgets, baseDir);
  const md = renderMarkdownReport(checkResult);

  console.log(md);

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    try {
      appendFileSync(stepSummary, md + '\n', 'utf8');
      console.log(`Wrote budget report to $GITHUB_STEP_SUMMARY: ${stepSummary}`);
    } catch (err) {
      console.warn(`Could not write to $GITHUB_STEP_SUMMARY: ${err.message}`);
    }
  }

  return checkResult;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { allPassed } = runBudgetCheck();
  if (!allPassed) {
    console.error('✖ Bundle budget check failed. One or more files exceeded their size ceilings.');
    process.exit(1);
  }
  console.log('✔ All bundle budgets passed within configured raw, gzip (level 9), and brotli (quality 11) ceilings.');
}
