// Automated linter for @kidthales/tol-palettes:
// 1. Validates all 22 scheme JSON files against schema/scheme.schema.json + invariants
// 2. Runs `node --check` syntax validation on all tools/*.mjs and tests/*.mjs
// 3. Verifies Paul Tol attribution headers across all generated files in dist/
// 4. Verifies zero tracked agent/scratch files in git
// 5. Verifies package.json subpath exports resolve on disk

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// 1. JSON Schema + Invariant validation
const results = validateAll();
if (results.length !== 22) {
  errors.push(`Expected 22 scheme files in data/schemes/, found ${results.length}.`);
}
for (const r of results) {
  for (const p of r.problems) {
    errors.push(`[schema] ${r.file}: ${p}`);
  }
}

// 2. Node.js syntax check on all tools/*.mjs and tests/*.mjs
for (const dirName of ['tools', 'tests']) {
  const dirPath = join(root, dirName);
  for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.mjs'))) {
    const fullPath = join(dirPath, file);
    try {
      execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`[syntax] ${dirName}/${file}: ${err.stderr?.toString() || err.message}`);
    }
  }
}

// 3. Attribution header check across dist/ outputs
const distCheckDirs = ['css', 'js', 'py', 'godot', 'gpl', 'aseprite', 'gallery', 'json'];
for (const sub of distCheckDirs) {
  const subPath = join(root, 'dist', sub);
  if (!existsSync(subPath)) {
    errors.push(`[dist] Missing dist/${sub} directory.`);
    continue;
  }
  const files = readdirSync(subPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  if (files.length === 0) {
    errors.push(`[dist] dist/${sub} is empty.`);
  }
  for (const f of files) {
    const content = readFileSync(join(subPath, f), 'utf8');
    if (!content.includes('Paul Tol') || !content.includes('not affiliated with or endorsed by Paul Tol')) {
      errors.push(`[attribution] dist/${sub}/${f} is missing the mandatory Paul Tol attribution header.`);
    }
  }
}

// 4. Agent / scratch file leak guard
try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const badPattern = /^(\.agents?\/|\.gemini\/|\.ai\/|\.cursor\/|\.claude\/|scratch\/|docs\/learnings\/|AGENTS\.md$|GEMINI\.md$|CLAUDE\.md$)/;
  for (const file of tracked) {
    if (badPattern.test(file)) {
      errors.push(`[hygiene] Agent or scratch file tracked in git: ${file}`);
    }
  }
} catch {
  // Ignore if git is unavailable
}

// 5. Package exports resolution check
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
  const targets = typeof target === 'string' ? [target] : Object.values(target);
  for (const t of targets) {
    const checkPath = t.includes('*') ? t.replace(/\/?\*.*$/, '') : t;
    if (!existsSync(join(root, checkPath))) {
      errors.push(`[exports] Export "${subpath}" target "${t}" does not exist on disk.`);
    }
  }
}

if (errors.length > 0) {
  console.error('✖ Lint failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('✔ Lint passed: 22 schemes valid, 0 JS syntax errors, 100% attribution headers, all exports verified.');
