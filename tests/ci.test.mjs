import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(root, 'scripts', 'ci-local.ps1');

test('-CI with -Quick exits non-zero and enforces fail-closed contract', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-CI', '-Quick'], {
    encoding: 'utf8',
  });
  assert.notEqual(res.status, 0, 'Expected non-zero exit status');
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.ok(combined.includes('fail-closed'), `Expected "fail-closed" in output, got: ${combined}`);
  assert.ok(combined.includes('-Quick'), `Expected "-Quick" in output, got: ${combined}`);
});

test('-CI with -SkipGenerate exits non-zero and enforces fail-closed contract', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-CI', '-SkipGenerate'], {
    encoding: 'utf8',
  });
  assert.notEqual(res.status, 0, 'Expected non-zero exit status');
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.ok(combined.includes('fail-closed'), `Expected "fail-closed" in output, got: ${combined}`);
  assert.ok(combined.includes('-SkipGenerate'), `Expected "-SkipGenerate" in output, got: ${combined}`);
});

test('valid repository workflows pass Gate 0', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only'], {
    cwd: root,
    encoding: 'utf8',
  });
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.equal(res.status, 0, `Expected Gate 0 to pass on repo workflows. Output: ${combined}`);
  assert.ok(combined.includes('All workflow run steps conform'), 'Expected success confirmation');
});

test('fixture workflow with un-allowlisted inline step fails Gate 0', () => {
  const fixtureDir = join(tmpdir(), `gate0_fixture_${randomUUID()}`);
  mkdirSync(fixtureDir, { recursive: true });
  try {
    writeFileSync(
      join(fixtureDir, 'unauthorized.yml'),
      `name: Unauthorized
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Unauthorized inline run
        run: echo "rogue step"
`,
      'utf8',
    );
    const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only', '-WorkflowsPath', fixtureDir], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.notEqual(res.status, 0, 'Expected non-zero exit status for unallowlisted step');
    const combined = (res.stdout || '') + (res.stderr || '');
    assert.ok(
      combined.includes('not in the Gate 0 exact allowlist'),
      `Expected allowlist violation in output: ${combined}`,
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('fixture verify job with non-canonical runner fails Gate 0', () => {
  const fixtureDir = join(tmpdir(), `gate0_fixture_${randomUUID()}`);
  mkdirSync(fixtureDir, { recursive: true });
  try {
    writeFileSync(
      join(fixtureDir, 'bad_verify.yml'),
      `name: BadVerify
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Invalid CI runner
        run: ./custom-runner.sh
`,
      'utf8',
    );
    const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only', '-WorkflowsPath', fixtureDir], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.notEqual(res.status, 0, 'Expected non-zero exit status for bad verify job');
    const combined = (res.stdout || '') + (res.stderr || '');
    assert.ok(
      combined.includes("verify job 'verify' defines steps but does not invoke"),
      `Expected verify job error in output: ${combined}`,
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('all third-party actions across all workflow files are pinned to 40-character commit SHAs', () => {
  const workflowsDir = join(root, '.github', 'workflows');
  const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'Must have workflow files');

  const shaPattern = /@[0-9a-fA-F]{40}/;

  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)['"]?/);
      if (match) {
        const actionRef = match[1];
        if (actionRef.startsWith('./') || actionRef.startsWith('../') || actionRef.startsWith('docker://')) {
          continue;
        }
        assert.match(
          actionRef,
          shaPattern,
          `Action reference in ${file} line ${i + 1} ("${actionRef}") must be pinned to a 40-char commit SHA`,
        );
      }
    }
  }
});

test('ci-local.ps1 defines native tol-palettes gates and excludes leaked Go gate names', () => {
  const content = readFileSync(scriptPath, 'utf8');

  const expectedGates = [
    'gate0_workflow_contract',
    'gate1_action_pins_and_leaks',
    'gate2_pwsh_ast_and_lint',
    'gate3_test_and_pack',
    'gate4_dist_drift',
  ];
  for (const gate of expectedGates) {
    assert.ok(content.includes(`"${gate}"`), `Expected native gate "${gate}" to be declared in ci-local.ps1`);
  }

  const leakedGates = [
    'gate2_go_vet',
    'gate4_govulncheck',
    'gate5_race_detector',
    'gate6_pwsh_ast',
    'gate7_knowledge_budget',
    'gate8_secret_leaks',
    'gate9_cross_compile',
  ];
  for (const leaked of leakedGates) {
    assert.ok(!content.includes(leaked), `Leaked Go gate "${leaked}" must not exist in ci-local.ps1`);
  }
});

test('ci-local.ps1 records gate4_dist_drift as not-applicable when -Quick or -SkipGenerate is used', () => {
  const content = readFileSync(scriptPath, 'utf8');
  assert.ok(
    content.includes('$GateResults["gate4_dist_drift"] = "not-applicable"'),
    'Expected gate4_dist_drift to be recorded as not-applicable during skip/quick runs',
  );
  assert.ok(
    content.includes('$GateResults["gate4_dist_drift"] = "pass"'),
    'Expected gate4_dist_drift to be recorded as pass during full verification runs',
  );
});

