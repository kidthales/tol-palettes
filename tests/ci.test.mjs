import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { auditWorkflows, hasUnescapedExpression } from '../tools/check-workflows.mjs';
import {
  resolveOutDir,
  resolveRealPath,
  stripWin32DeviceNamespacePrefix,
  isSameOrSubpath,
  assertValidMtimeOption,
  assertSafeWriteTarget,
  parseCliOutDir,
} from '../tools/path-jail.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(root, 'scripts', 'ci-local.ps1');

function withTempFixture(files, fn) {
  const dir = join(tmpdir(), `wf_fixture_${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, 'utf8');
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

test('-CI with -Gate1Only exits non-zero and enforces fail-closed contract', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-CI', '-Gate1Only'], {
    encoding: 'utf8',
  });
  assert.notEqual(res.status, 0, 'Expected non-zero exit status');
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.ok(combined.includes('fail-closed'), `Expected "fail-closed" in output, got: ${combined}`);
  assert.ok(combined.includes('-Gate1Only'), `Expected "-Gate1Only" in output, got: ${combined}`);
});

test('-Gate0Only combined with -Gate1Only exits non-zero and rejects mutual exclusion', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only', '-Gate1Only'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  assert.notEqual(res.status, 0, 'Expected non-zero exit status when combining -Gate0Only and -Gate1Only');
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.ok(
    combined.includes('-Gate0Only and -Gate1Only cannot be combined'),
    `Expected mutual-exclusion error in output, got: ${combined}`,
  );
});

test('valid repository workflows pass Gate 0 and Gate 1', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.equal(res.status, 0, `Expected Gate 0 to pass on repo workflows. Output: ${combined}`);
  assert.ok(combined.includes('All workflow run steps conform'), 'Expected success confirmation');

  const gate1Res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  const gate1Out = (gate1Res.stdout || '') + (gate1Res.stderr || '');
  assert.equal(gate1Res.status, 0, `Expected Gate 1 to pass on repo workflows. Output: ${gate1Out}`);
  assert.ok(gate1Out.includes('[gate1_action_pins_and_leaks: PASS]'), 'Expected Gate 1 PASS summary');
});

test('fixture workflow with un-allowlisted inline step fails Gate 0', () => {
  withTempFixture(
    {
      'unauthorized.yml': `name: Unauthorized
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Unauthorized inline run
        run: echo "rogue step"
`,
    },
    (fixtureDir) => {
      const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only', '-WorkflowsPath', fixtureDir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(res.status, 0, 'Expected non-zero exit status for unallowlisted step');
      const combined = (res.stdout || '') + (res.stderr || '');
      assert.ok(
        combined.includes('not in the Gate 0 exact allowlist'),
        `Expected allowlist violation in output: ${combined}`,
      );
    },
  );
});

test('fixture verify job with non-canonical runner fails Gate 0', () => {
  withTempFixture(
    {
      'bad_verify.yml': `name: BadVerify
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Invalid CI runner
        run: ./custom-runner.sh
`,
    },
    (fixtureDir) => {
      const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only', '-WorkflowsPath', fixtureDir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(res.status, 0, 'Expected non-zero exit status for bad verify job');
      const combined = (res.stdout || '') + (res.stderr || '');
      assert.ok(
        combined.includes("verify job 'verify' defines steps but does not invoke"),
        `Expected verify job error in output: ${combined}`,
      );
    },
  );
});

test('all third-party actions across all workflow files are pinned to 40-character commit SHAs', () => {
  const workflowsDir = join(root, '.github', 'workflows');
  const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'Must have workflow files');

  const shaPattern = /@[0-9a-fA-F]{40}$/;
  const dockerDigestPattern = /@sha256:[0-9a-fA-F]{64}$/;

  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)['"]?/);
      if (match) {
        const actionRef = match[1];
        assert.ok(
          !actionRef.startsWith('$'),
          `Workflow/action reference in ${file} line ${i + 1} ("${actionRef}") must not start with "$" (use "./" for same-repository references)`,
        );
        assert.ok(
          !actionRef.startsWith('../'),
          `Workflow/action reference in ${file} line ${i + 1} ("${actionRef}") must not use "../" relative path (must start with "./")`,
        );
        if (actionRef.startsWith('./')) {
          assert.ok(
            !actionRef.includes('..') && !actionRef.includes('\\') && !actionRef.includes('@'),
            `Same-repository reference in ${file} line ${i + 1} ("${actionRef}") must be canonical and must not specify an @ref`,
          );
          continue;
        }
        if (actionRef.startsWith('docker://')) {
          assert.match(
            actionRef,
            dockerDigestPattern,
            `Docker action reference in ${file} line ${i + 1} ("${actionRef}") must be pinned to a @sha256 digest`,
          );
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
    'gate3_dist_drift',
    'gate4_test_and_pack',
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

test('ci-local.ps1 records gate3_dist_drift as not-applicable when -Quick or -SkipGenerate is used', () => {
  const content = readFileSync(scriptPath, 'utf8');
  assert.ok(
    content.includes('$GateResults["gate3_dist_drift"] = "not-applicable"'),
    'Expected gate3_dist_drift to be recorded as not-applicable during skip/quick runs',
  );
  assert.ok(
    content.includes('$GateResults["gate3_dist_drift"] = "pass"'),
    'Expected gate3_dist_drift to be recorded as pass during full verification runs',
  );
});

test('ci-local.ps1 auto-enables $CI when $env:GITHUB_ACTIONS is set', () => {
  const content = readFileSync(scriptPath, 'utf8');
  assert.match(
    content,
    /\$IsCI\s*=\s*\$CI\.IsPresent\s+-or\s+\(-not\s+\[string\]::IsNullOrWhiteSpace\(\$env:GITHUB_ACTIONS\)\)/,
    'Expected GITHUB_ACTIONS check for auto-enabling $CI',
  );
});

test('ci-local.ps1 contains no deprecated seldon ci receipt or SeldonBin references', () => {
  const content = readFileSync(scriptPath, 'utf8');

  assert.ok(!content.includes('ci receipt'), 'ci-local.ps1 must not invoke deprecated "ci receipt"');
  assert.ok(!content.includes('seldon ci receipt'), 'ci-local.ps1 must not reference "seldon ci receipt"');
  assert.ok(!content.includes('SeldonBin'), 'ci-local.ps1 must not contain legacy $SeldonBin lookup logic');
  assert.ok(!content.includes('SELDON_BIN'), 'ci-local.ps1 must not inspect $env:SELDON_BIN');
});

test('ci-local.ps1 emits Schema v2 structured Gate Summary lines for seldon ci run', () => {
  const content = readFileSync(scriptPath, 'utf8');

  assert.match(
    content,
    /function\s+Write-CiGateSummary/i,
    'Expected ci-local.ps1 to define Write-CiGateSummary helper',
  );

  assert.match(
    content,
    /Write-Host\s+["']`nGate Summary:['"]/i,
    'Expected ci-local.ps1 to emit Gate Summary: header',
  );

  assert.match(
    content,
    /foreach\s*\(\s*\$k\s+in\s+\$Results\.Keys\s*\)/,
    'Expected loop over $Results.Keys in summary block',
  );

  assert.match(
    content,
    /Write-Host\s+["']\s*\[\$\{k\}:\s*\$v\]["']/,
    'Expected formatted "[${k}: $v]" gate summary line emission',
  );
});

test('ci-local.ps1 gate summary output conforms to Seldon Schema v2 parser contract', () => {
  const content = readFileSync(scriptPath, 'utf8');
  const gateInitMatch = content.match(/\$GateResults\s*=\s*\[ordered\]@\{([^}]+)\}/s);
  assert.ok(gateInitMatch, 'Expected $GateResults ordered dictionary initialization in ci-local.ps1');

  const declaredGates = [...gateInitMatch[1].matchAll(/["'](gate\d+_[a-zA-Z0-9_]+)["']/g)].map((m) => m[1]);
  assert.equal(declaredGates.length, 5, 'Expected exactly 5 declared gates in $GateResults');

  // Extract Write-CiGateSummary directly from ci-local.ps1 to prevent test tautology
  const funcMatch = content.match(/function\s+Write-CiGateSummary\s*\{[\s\S]*?\n\}/);
  assert.ok(funcMatch, 'Expected Write-CiGateSummary function in ci-local.ps1');

  const psSnippet = [
    funcMatch[0],
    '$GateResults = [ordered]@{',
    '  "gate0_workflow_contract" = "pass"',
    '  "gate1_action_pins_and_leaks" = "pass"',
    '  "gate2_pwsh_ast_and_lint" = "pass"',
    '  "gate3_dist_drift" = "not-applicable"',
    '  "gate4_test_and_pack" = "pass"',
    '}',
    'Write-CiGateSummary $GateResults',
  ].join('\n');
  const res = spawnSync('pwsh', ['-NoProfile', '-Command', psSnippet], { encoding: 'utf8' });
  assert.equal(res.status, 0);

  const lines = res.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  assert.ok(lines.some((l) => /^gate summary:?$/i.test(l)), 'Missing Gate Summary header in output');

  const gateLineRegex = /^\[(gate\d+_[a-z0-9_]+):\s*(PASS|FAIL|NOT-APPLICABLE)\]$/;
  const parsedGates = {};
  for (const line of lines) {
    const match = line.match(gateLineRegex);
    if (match) {
      parsedGates[match[1]] = match[2];
    }
  }

  for (const gate of declaredGates) {
    assert.ok(gate in parsedGates, `Expected gate "${gate}" to be emitted in summary`);
    assert.match(parsedGates[gate], /^(PASS|FAIL|NOT-APPLICABLE)$/);
  }
});

test('ci-local.ps1 emits Gate Summary with FAIL on gate failure path', () => {
  withTempFixture(
    {
      'unauthorized.yml': `name: Unauthorized
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Unauthorized inline run
        run: echo "rogue step"
`,
    },
    (fixtureDir) => {
      const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-WorkflowsPath', fixtureDir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(res.status, 0, 'Expected non-zero exit status for failing run');
      const combined = (res.stdout || '') + (res.stderr || '');
      assert.ok(combined.includes('Gate Summary:'), `Expected "Gate Summary:" in output on failure: ${combined}`);
      assert.ok(
        combined.includes('[gate0_workflow_contract: FAIL]'),
        `Expected "[gate0_workflow_contract: FAIL]" in output: ${combined}`,
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Unit tests: hasUnescapedExpression
// ---------------------------------------------------------------------------

test('hasUnescapedExpression rejects direct and backslash-escaped expressions', () => {
  assert.equal(hasUnescapedExpression('echo ${{ github.sha }}'), true);
  assert.equal(hasUnescapedExpression('echo \\${{ github.sha }}'), true);
  assert.equal(hasUnescapedExpression('echo \\\\${{ github.sha }}'), true);
  assert.equal(hasUnescapedExpression('${{ inputs.name }}'), true);
  assert.equal(hasUnescapedExpression('run: | \n  echo "${{ github.event_name }}"'), true);
});

test('hasUnescapedExpression accepts plain strings and environment variables without expressions', () => {
  assert.equal(hasUnescapedExpression('echo "$JOB_STATUS"'), false);
  assert.equal(hasUnescapedExpression('./scripts/ci-local.ps1 -CI'), false);
  assert.equal(hasUnescapedExpression(''), false);
  assert.equal(hasUnescapedExpression(null), false);
  assert.equal(hasUnescapedExpression(123), false);
});

// ---------------------------------------------------------------------------
// Unit & fixture tests: auditWorkflows
// ---------------------------------------------------------------------------

test('auditWorkflows returns ok: true on repository workflows', () => {
  const res = auditWorkflows(root);
  assert.equal(res.ok, true, `Expected repo workflows to be valid, got violations: ${res.violations.join('; ')}`);
  assert.equal(res.violations.length, 0);
  assert.equal(res.length, 0);
});

test('auditWorkflows fails when top-level permissions block is missing or invalid', () => {
  withTempFixture(
    {
      'missing_perms.yml': `name: MissingPerms
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Install dependencies
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('missing top-level permissions block')));
    },
  );

  withTempFixture(
    {
      'invalid_perms.yml': `name: InvalidPerms
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Install dependencies
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("top-level permissions must be strictly '{ contents: read }'")));
    },
  );
});

test('auditWorkflows fails on unauthorized job write permissions', () => {
  withTempFixture(
    {
      'unauthorized_job_write.yml': `name: BadJobPerms
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write
    steps:
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("unauthorized write permission for scope 'contents'")));
    },
  );
});

test('auditWorkflows fails on unpinned third-party action or non-canonical local action', () => {
  withTempFixture(
    {
      'unpinned.yml': `name: Unpinned
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: false
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('must pin to 40-char commit SHA')));
    },
  );

  withTempFixture(
    {
      'non_canonical.yml': `name: NonCanonical
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Local
        uses: ../local-action
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('uses non-canonical relative path')));
    },
  );
});

test('auditWorkflows and ci-local.ps1 Gate 1 reject any uses: starting with $, ../, and ./ references with @ref', () => {
  withTempFixture(
    {
      'dollar_job.yml': `name: DollarJob
permissions:
  contents: read
jobs:
  call:
    uses: $/.github/workflows/ci.yml
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("'$' prefix is invalid")));

      // Verify ci-local.ps1 Gate 1 directly rejects it without halting at Gate 0
      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate0_workflow_contract: NOT-APPLICABLE]'));
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("'$' prefix is invalid"));
    },
  );

  withTempFixture(
    {
      'local_ref.yml': `name: LocalRef
permissions:
  contents: read
jobs:
  call:
    uses: ./.github/workflows/ci.yml@main
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("same-repository workflow references must not specify an @ref")));

      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("must not specify an @ref"));
    },
  );

  withTempFixture(
    {
      'local_step_ref.yml': `name: LocalStepRef
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Local step with ref
        uses: ./.github/actions/my-action@main
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("same-repository local action references must not specify an @ref")));

      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("must not specify an @ref"));
    },
  );

  withTempFixture(
    {
      'relative_parent.yml': `name: RelativeParent
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Local parent relative
        uses: ../local-action
`,
    },
    (dir) => {
      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("must start with './'"));
    },
  );

  withTempFixture(
    {
      'dollar_step.yml': `name: DollarStep
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Invalid step uses
        uses: $/.github/actions/my-action
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("'$' prefix is invalid")));

      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("'$' prefix is invalid"));
    },
  );

  // Single-line workflow file must be evaluated as a full line, not scalar [char] indexing
  withTempFixture(
    {
      'single_line.yml': 'uses: $/.github/workflows/ci.yml',
    },
    (dir) => {
      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(combined.includes("'$' prefix is invalid"));
    },
  );

  // Missing or empty workflows directory must fail closed under -Gate1Only
  withTempFixture({}, (emptyDir) => {
    const emptyRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', emptyDir], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    assert.notEqual(emptyRes.status, 0, 'Expected empty workflows directory to fail closed under -Gate1Only');
    const emptyOut = (emptyRes.stdout || '') + (emptyRes.stderr || '');
    assert.ok(emptyOut.includes('[gate1_action_pins_and_leaks: FAIL]'));
    assert.ok(emptyOut.includes('No workflow files'));

    const missingDir = join(emptyDir, 'nonexistent');
    const missingRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', missingDir], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    assert.notEqual(missingRes.status, 0, 'Expected missing workflows directory to fail closed under -Gate1Only');
    const missingOut = (missingRes.stdout || '') + (missingRes.stderr || '');
    assert.ok(missingOut.includes('[gate1_action_pins_and_leaks: FAIL]'));
    assert.ok(missingOut.includes('Workflows directory not found'));
  });

  // Multiple invalid uses: targets across files must all be reported before throwing
  withTempFixture(
    {
      'multi_a.yml': `name: MultiA
permissions:
  contents: read
jobs:
  call:
    uses: $/.github/workflows/ci.yml
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: ../local-action
      - uses: ./.github/actions/my-action@main
`,
      'multi_b.yml': `name: MultiB
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: docker://alpine:latest
      - uses: actions/checkout@v4
`,
    },
    (multiDir) => {
      const multiRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate1Only', '-WorkflowsPath', multiDir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(multiRes.status, 0, 'Expected multi-violation fixture to fail closed under -Gate1Only');
      const multiOut = (multiRes.stdout || '') + (multiRes.stderr || '');
      assert.ok(multiOut.includes('[gate1_action_pins_and_leaks: FAIL]'));
      assert.ok(multiOut.includes("'$' prefix is invalid"));
      assert.ok(multiOut.includes("must start with './'"));
      assert.ok(multiOut.includes('must not specify an @ref'));
      assert.ok(multiOut.includes('must pin to @sha256 digest'));
      assert.ok(multiOut.includes('must pin to 40-char commit SHA'));
      assert.ok(multiOut.includes('Gate 1 Failed: GitHub Actions commit SHA pin verification failed.'));
    },
  );
});

test('auditWorkflows fails when actions/checkout is missing persist-credentials: false', () => {
  withTempFixture(
    {
      'bad_checkout.yml': `name: BadCheckout
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: true
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('without persist-credentials: false')));
    },
  );
});

test('auditWorkflows fails when run script has unescaped expression or forbidden command', () => {
  withTempFixture(
    {
      'unescaped.yml': `name: Unescaped
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Install dependencies
        run: echo "branch is \${{ github.ref }}"
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('contains unescaped expression in run script')));
    },
  );

  withTempFixture(
    {
      'forbidden_cmd.yml': `name: ForbiddenCommand
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Install dependencies
        run: npm test
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('runs forbidden direct test/lint/pack command')));
    },
  );
});

test('auditWorkflows enforces timeout-minutes and job-level permissions on jobs with steps', () => {
  withTempFixture(
    {
      'missing_timeout.yml': `name: MissingTimeout
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("missing 'timeout-minutes'")));
    },
  );

  withTempFixture(
    {
      'excessive_timeout.yml': `name: ExcessiveTimeout
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 999
    permissions:
      contents: read
    steps:
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("has invalid 'timeout-minutes'")));
    },
  );

  withTempFixture(
    {
      'missing_job_perms.yml': `name: MissingJobPerms
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('missing explicit job-level permissions block')));
    },
  );
});

test('auditWorkflows rejects unpinned docker action', () => {
  withTempFixture(
    {
      'docker_unpinned.yml': `name: DockerUnpinned
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Run docker action
        uses: docker://alpine:latest
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('uses unpinned docker action')));
    },
  );
});

test('auditWorkflows enforces ci.yml architectural contracts', () => {
  // Missing concurrency
  withTempFixture(
    {
      'ci.yml': `name: CI
permissions:
  contents: read
jobs:
  security:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - uses: gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e
      - uses: zizmorcore/zizmor-action@53290badfa369cb0bf7ad16342cb62c2fa47ac7b
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
  notify:
    if: always() && github.event_name != 'workflow_call'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - name: Dispatch consolidated status card to
        run: echo done
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes('missing top-level concurrency isolation block')));
    },
  );

  // Missing security job
  withTempFixture(
    {
      'ci.yml': `name: CI
permissions:
  contents: read
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Run CI
        run: ./scripts/ci-local.ps1 -CI
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("missing dedicated 'security' job")));
    },
  );
});

test('auditWorkflows enforces pages.yml architectural contracts', () => {
  withTempFixture(
    {
      'pages.yml': `name: Deploy GitHub Pages
permissions:
  contents: read
concurrency:
  group: pages-\${{ github.ref }}
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      - name: Generate static gallery
        run: npm run generate:gallery
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("missing 'verify' job delegation")));
    },
  );
});

test('auditWorkflows enforces release.yml architectural contracts', () => {
  withTempFixture(
    {
      'release.yml': `name: Release
permissions:
  contents: read
concurrency:
  group: release-\${{ github.repository }}
  cancel-in-progress: false
jobs:
  tag-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
        with:
          node-version: 22
      - name: Verify release tag matches project metadata versions
        run: echo no exit
  verify:
    uses: ./.github/workflows/ci.yml
  attach-assets:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write
      attestations: write
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("tag-guard step must fail closed with 'exit 1'")));
      assert.ok(res.violations.some((v) => v.includes("verify job must declare needs: [tag-guard]")));
      assert.ok(res.violations.some((v) => v.includes("must set package-manager-cache: false")));
      assert.ok(res.violations.some((v) => v.includes("attach-assets job missing actions/attest step")));
    },
  );

  withTempFixture(
    {
      'release.yml': `name: Release
permissions:
  contents: read
concurrency:
  group: release-\${{ github.repository }}
  cancel-in-progress: false
jobs:
  tag-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
        with:
          node-version: 22
          package-manager-cache: false
      - name: Verify release tag matches project metadata versions
        run: exit 1
  verify:
    needs: [tag-guard]
    uses: ./.github/workflows/ci.yml
  attach-assets:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write
      attestations: write
      id-token: write
    steps:
      - name: Attest Build Provenance
        uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6
        with:
          subject-path: dist/assets/*.zip
          create-storage-record: false
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, true, `Expected valid fixture to pass, got violations: ${res.violations.join('; ')}`);
      assert.ok(!res.violations.some((v) => v.includes("attach-assets job missing actions/attest step")));
    },
  );
});

// ---------------------------------------------------------------------------
// Unit tests: tools/path-jail.mjs
// ---------------------------------------------------------------------------

test('path-jail: resolveOutDir enforces repository jail and rejects protected paths', () => {
  assert.throws(() => resolveOutDir(null), /Invalid outDir/);
  assert.throws(() => resolveOutDir({ outDir: '' }), /Invalid outDir/);
  assert.throws(() => resolveOutDir({ outDir: '   ' }), /Invalid outDir/);
  assert.throws(() => resolveOutDir({ outDir: null }), /Invalid outDir/);
  assert.throws(() => resolveOutDir({ outDir: undefined }), /Invalid outDir/);
  assert.throws(() => resolveOutDir({ outDir: root }), /refusing to write to protected path/);
  assert.throws(() => resolveOutDir({ outDir: join(root, 'data') }), /refusing to write to protected path/);
  assert.throws(() => resolveOutDir({ outDir: join(root, 'schema') }), /refusing to write to protected path/);
  assert.throws(() => resolveOutDir({ outDir: join(root, 'tools') }), /refusing to write to protected path/);
  assert.throws(() => resolveOutDir({ outDir: join(root, 'tests') }), /refusing to write to protected path/);
  assert.throws(() => resolveOutDir({ outDir: join(root, '..foo') }), /refusing to write outside allowed jail boundary/);
  assert.throws(() => resolveOutDir({ outDir: join(root, 'dist..foo') }), /refusing to write outside allowed jail boundary/);
  assert.throws(() => resolveOutDir({ outDir: dirname(root) }), /refusing to write outside allowed jail boundary/);

  // Allowed targets
  const defaultDist = resolveOutDir();
  assert.equal(defaultDist, resolveRealPath(join(root, 'dist')));

  // Rejects out-of-boundary paths when allowedRoot defaults to repo root
  assert.throws(() => resolveOutDir({ outDir: tmpdir() }), /refusing to write outside allowed jail boundary/);

  // Accepts outDir when explicitly within allowedRoot
  const tempTarget = join(tmpdir(), 'tol_test_dist');
  assert.equal(resolveOutDir({ outDir: tempTarget, allowedRoot: tmpdir() }), resolveRealPath(tempTarget));
});

test('path-jail: assertSafeWriteTarget verifies targets within boundary', () => {
  assert.throws(() => assertSafeWriteTarget(''), /Invalid targetPath/);
  assert.throws(() => assertSafeWriteTarget(tmpdir()), /refusing to write outside allowed jail boundary/);
  const safe = join(root, 'dist', 'test.txt');
  assert.equal(assertSafeWriteTarget(safe), resolveRealPath(safe));
});

test('path-jail: parseCliOutDir parses flags and fails closed on invalid input', () => {
  assert.equal(parseCliOutDir([]), undefined);
  assert.equal(parseCliOutDir(['--other', 'val']), undefined);
  assert.equal(parseCliOutDir(['--outDir', 'custom_dist']), 'custom_dist');
  assert.equal(parseCliOutDir(['--outdir', 'custom_dist2']), 'custom_dist2');
  assert.equal(parseCliOutDir(['--outDir=custom_dist3']), 'custom_dist3');
  assert.equal(parseCliOutDir(['--outdir=custom_dist4']), 'custom_dist4');

  assert.throws(() => parseCliOutDir(['--outDir']), /missing or empty directory argument/);
  assert.throws(() => parseCliOutDir(['--outdir', '   ']), /missing or empty directory argument/);
  assert.throws(() => parseCliOutDir(['--outDir', '--other']), /missing or empty directory argument/);
  assert.throws(() => parseCliOutDir(['--outDir=']), /value cannot be empty/);
  assert.throws(() => parseCliOutDir(['--outdir=']), /value cannot be empty/);
});

test('path-jail: assertValidMtimeOption accepts Date and rejects non-Date', () => {
  assert.throws(() => assertValidMtimeOption(null), /Invalid options/);
  assert.throws(() => assertValidMtimeOption({ mtime: null }), /Invalid mtime/);
  assert.throws(() => assertValidMtimeOption({ mtime: undefined }), /Invalid mtime/);
  assert.throws(() => assertValidMtimeOption({ mtime: 'garbage' }), /Invalid mtime/);
  assert.throws(() => assertValidMtimeOption({ mtime: new Date('invalid') }), /Invalid mtime/);

  const d = new Date('2026-01-01T00:00:00Z');
  assert.equal(assertValidMtimeOption({ mtime: d }), d);
  assert.equal(assertValidMtimeOption({}), undefined);
});

test('path-jail: stripWin32DeviceNamespacePrefix strips NT and DOS device prefixes', () => {
  assert.equal(stripWin32DeviceNamespacePrefix('\\\\?\\C:\\repo\\src'), 'C:\\repo\\src');
  assert.equal(stripWin32DeviceNamespacePrefix('\\??\\C:\\repo\\src'), 'C:\\repo\\src');
  assert.equal(stripWin32DeviceNamespacePrefix('\\\\.\\C:\\repo\\src'), 'C:\\repo\\src');
  assert.equal(stripWin32DeviceNamespacePrefix('//?/C:/repo/src'), 'C:/repo/src');
  assert.equal(stripWin32DeviceNamespacePrefix('//./C:/repo/src'), 'C:/repo/src');
  assert.equal(stripWin32DeviceNamespacePrefix('/??/C:/repo/src'), 'C:/repo/src');
  assert.equal(stripWin32DeviceNamespacePrefix('\\\\?\\UNC\\server\\share\\src'), '\\\\server\\share\\src');
  assert.equal(stripWin32DeviceNamespacePrefix('\\\\.\\UNC\\server\\share\\src'), '\\\\server\\share\\src');

  assert.throws(
    () => stripWin32DeviceNamespacePrefix('\\\\?\\Volume{01234567-89ab-cdef-0123-456789abcdef}\\src'),
    /unsupported Windows device-namespace or volume path/
  );
  assert.throws(
    () => stripWin32DeviceNamespacePrefix('\\\\.\\PhysicalDrive0'),
    /unsupported Windows device-namespace or volume path/
  );
});

test('path-jail: isSameOrSubpath correctly detects subpath relations', () => {
  assert.equal(isSameOrSubpath(join(root, 'dist'), root), true);
  assert.equal(isSameOrSubpath(join(root, 'dist', 'css'), root), true);
  assert.equal(isSameOrSubpath(root, join(root, 'dist')), false);
  assert.equal(isSameOrSubpath(tmpdir(), root), false);
});

// ---------------------------------------------------------------------------
// Regression tests: CI Python matrix, requirements-ci, & release.yml contracts
// ---------------------------------------------------------------------------

test('ci.yml spans Python 3.11-3.14 across 4 matrix legs, forwards optional workflow_call ref, and requirements-ci pins matplotlib==3.11.2', () => {
  const ciDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'));
  const include = ciDoc?.jobs?.verify?.strategy?.matrix?.include;
  assert.ok(Array.isArray(include), 'Expected verify.strategy.matrix.include array in ci.yml');
  assert.equal(include.length, 4, 'Expected exactly 4 matrix legs in ci.yml');

  const pythonVersions = include.map((leg) => String(leg.python)).sort();
  assert.deepEqual(pythonVersions, ['3.11', '3.12', '3.13', '3.14']);

  const refInput = ciDoc?.on?.workflow_call?.inputs?.ref;
  assert.ok(refInput, 'Expected optional inputs.ref on workflow_call in ci.yml');
  assert.equal(refInput.type, 'string');
  assert.equal(refInput.required, false);

  for (const jobId of ['security', 'verify']) {
    const steps = ciDoc?.jobs?.[jobId]?.steps || [];
    const checkoutSteps = steps.filter((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
    assert.equal(checkoutSteps.length, 1, `Expected 1 actions/checkout step in ci.yml ${jobId}`);
    assert.equal(checkoutSteps[0].with?.ref, '${{ inputs.ref }}', `Expected ref: \${{ inputs.ref }} in ci.yml ${jobId}`);
    assert.equal(checkoutSteps[0].with?.['persist-credentials'], false);
  }

  const ciLocalContent = readFileSync(scriptPath, 'utf8');
  assert.ok(
    ciLocalContent.includes("Install Python 3.11+ and ensure 'python' is on PATH."),
    'Expected ci-local.ps1 -CI missing-tool hint to match Python 3.11+ floor',
  );
  assert.ok(
    !ciLocalContent.includes('Install Python 3.12+'),
    'Stale Python 3.12+ floor hint must not remain in ci-local.ps1',
  );

  const reqs = readFileSync(join(root, 'requirements-ci.txt'), 'utf8');
  assert.match(reqs, /^matplotlib==3\.11\.2\s*$/m, 'Expected matplotlib==3.11.2 pin in requirements-ci.txt');
});

test('release.yml locks all actions/checkout steps and verify workflow_call to target tag ref, and resolves notify tag + SHA', () => {
  const releaseDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));
  const expectedRef =
    "${{ github.event.release.tag_name && format('refs/tags/{0}', github.event.release.tag_name) || inputs.tag && format('refs/tags/{0}', inputs.tag) || github.ref }}";
  const expectedJobsWithCheckout = ['tag-guard', 'publish-npm', 'publish-gpr', 'publish-pypi', 'attach-assets'];

  let checkoutCount = 0;
  for (const jobId of expectedJobsWithCheckout) {
    const steps = releaseDoc?.jobs?.[jobId]?.steps || [];
    const checkoutSteps = steps.filter((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
    assert.equal(checkoutSteps.length, 1, `Expected 1 actions/checkout step in ${jobId}`);
    assert.equal(checkoutSteps[0].with?.ref, expectedRef, `Expected tag-locked checkout ref in ${jobId}`);
    assert.equal(checkoutSteps[0].with?.['persist-credentials'], false, `Expected persist-credentials: false in ${jobId}`);
    checkoutCount += checkoutSteps.length;
  }
  assert.equal(checkoutCount, 5);

  assert.equal(releaseDoc?.jobs?.verify?.uses, './.github/workflows/ci.yml');
  const verifyRef = releaseDoc?.jobs?.verify?.with?.ref;
  assert.equal(verifyRef, expectedRef, 'Expected release.yml verify job to forward target ref to ci.yml');
  assert.ok(
    verifyRef.includes("format('refs/tags/{0}', github.event.release.tag_name)") &&
      verifyRef.includes("format('refs/tags/{0}', inputs.tag)"),
    'Expected release.yml verify.with.ref to qualify release.tag_name and inputs.tag with refs/tags/',
  );

  const pagesDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8'));
  assert.equal(pagesDoc?.jobs?.verify?.uses, './.github/workflows/ci.yml');

  const tagGuardJob = releaseDoc?.jobs?.['tag-guard'];
  assert.equal(tagGuardJob?.outputs?.sha, '${{ steps.verify-tag.outputs.sha }}');
  const tgVerifyStep = (tagGuardJob?.steps || []).find((s) => s.name === 'Verify release tag matches project metadata versions');
  assert.equal(tgVerifyStep?.id, 'verify-tag');
  assert.match(tgVerifyStep?.run || '', /echo "sha=\$\(git rev-parse HEAD\)" >> "\$GITHUB_OUTPUT"/);

  const notifySteps = releaseDoc?.jobs?.notify?.steps || [];
  assert.equal(notifySteps.length, 1);
  const notifyStep = notifySteps[0];
  assert.equal(notifyStep.env?.RELEASE_TAG, '${{ github.event.release.tag_name }}');
  assert.equal(notifyStep.env?.DISPATCH_TAG, '${{ inputs.tag }}');
  assert.equal(notifyStep.env?.REF_NAME, '${{ github.ref_name }}');
  assert.equal(notifyStep.env?.SHA, '${{ needs.tag-guard.outputs.sha || github.sha }}');
  assert.match(notifyStep.run, /TAG_NAME="\$\{RELEASE_TAG:-\$\{DISPATCH_TAG:-\$REF_NAME\}\}"/);
});

test('release.yml tag-guard regex accepts valid SemVer/prerelease tags, rejects invalid formats, and executes PEP 440 parity check', () => {
  const releaseDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));
  const tgSteps = releaseDoc?.jobs?.['tag-guard']?.steps || [];
  const verifyStep = tgSteps.find((s) => s.name === 'Verify release tag matches project metadata versions');
  assert.ok(verifyStep, 'Expected Verify release tag step in release.yml');

  const regexMatch = verifyStep.run.match(/\[\[\s*"\$TAG"\s*=~\s*([^\s]+)\s*\]\]/);
  assert.ok(regexMatch, 'Expected bash regex match against $TAG in tag-guard');
  const tagPattern = regexMatch[1];
  assert.equal(tagPattern, '^v[0-9]+\\.[0-9]+\\.[0-9]+(-(alpha|beta|rc)\\.[1-9][0-9]*)?$');

  const tagRegex = new RegExp(tagPattern);
  for (const valid of ['v0.3.1', 'v1.0.0', 'v1.0.0-alpha.1', 'v1.0.0-beta.2', 'v1.0.0-rc.10']) {
    assert.equal(tagRegex.test(valid), true, `Expected tag "${valid}" to match tag-guard regex`);
  }
  for (const invalid of [
    '1.0.0',
    'v1.0',
    'v1.0.0-alpha',
    'v1.0.0-alpha.0',
    'v1.0.0-preview.1',
    'v1.0.0a1',
    'v1.0.0-alpha.1+build.1',
    '',
  ]) {
    assert.equal(tagRegex.test(invalid), false, `Expected invalid tag "${invalid}" to be rejected by tag-guard regex`);
  }

  assert.match(verifyStep.run, /semverToPep440/, 'Expected tag-guard to compute PEP 440 parity via semverToPep440');
  assert.match(verifyStep.run, /pyproject\.toml/, 'Expected tag-guard to verify pyproject.toml version parity');

  const esmMatch = verifyStep.run.match(/EXPECTED_PY_VER=\$\(PKG_VER="\$PKG_VER"\s+node\s+--input-type=module\s+-e\s+"([^"]+)"\)/);
  assert.ok(esmMatch, 'Expected inline node --input-type=module -e snippet for EXPECTED_PY_VER in tag-guard');
  const esmScript = esmMatch[1];

  for (const [semver, expectedPep440] of [
    ['1.0.0-alpha.1', '1.0.0a1'],
    ['1.0.0-beta.3', '1.0.0b3'],
    ['1.0.0-rc.2', '1.0.0rc2'],
    ['1.0.0', '1.0.0'],
  ]) {
    const esmRes = spawnSync(process.execPath, ['--input-type=module', '-e', esmScript], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PKG_VER: semver },
    });
    assert.equal(esmRes.status, 0, `Expected inline semverToPep440 snippet to succeed for ${semver}: ${esmRes.stderr}`);
    assert.equal(esmRes.stdout.trim(), expectedPep440);
  }

  const badEsmRes = spawnSync(process.execPath, ['--input-type=module', '-e', esmScript], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PKG_VER: '1.0.0-alpha.0' },
  });
  assert.notEqual(badEsmRes.status, 0, 'Expected inline semverToPep440 snippet to exit non-zero on invalid SemVer');

  const pyVerMatch = verifyStep.run.match(/PY_VER=\$\(node\s+-p\s+'((?:[^']|'\\'')+)'\)/);
  assert.ok(pyVerMatch, 'Expected inline node -p snippet for PY_VER extraction in tag-guard');
  const pyVerScript = pyVerMatch[1].replace(/'\\''/g, "'");

  withTempFixture(
    {
      'pyproject.toml': '[project]\nname = "tol-palettes"\nversion = "1.0.0a1"\n',
    },
    (dir) => {
      const pyRes = spawnSync(process.execPath, ['-p', pyVerScript], { cwd: dir, encoding: 'utf8' });
      assert.equal(pyRes.status, 0, `Expected PY_VER extraction to succeed: ${pyRes.stderr}`);
      assert.equal(pyRes.stdout.trim(), '1.0.0a1');
      assert.notEqual(pyRes.stdout.trim(), '1.0.0b1', 'Mismatched PEP 440 version must be distinguishable');
    },
  );

  withTempFixture(
    {
      'pyproject.toml': "[project]\nname = 'tol-palettes'\nversion = '1.0.0rc2'\n",
    },
    (dir) => {
      const pyRes = spawnSync(process.execPath, ['-p', pyVerScript], { cwd: dir, encoding: 'utf8' });
      assert.equal(pyRes.status, 0, `Expected single-quoted PY_VER extraction to succeed: ${pyRes.stderr}`);
      assert.equal(pyRes.stdout.trim(), '1.0.0rc2');
    },
  );

  withTempFixture(
    {
      'pyproject.toml': '[project]\nname = "tol-palettes"\n',
    },
    (dir) => {
      const pyRes = spawnSync(process.execPath, ['-p', pyVerScript], { cwd: dir, encoding: 'utf8' });
      assert.notEqual(pyRes.status, 0, 'Expected missing version field in pyproject.toml to exit non-zero');
    },
  );
});

test('release.yml routes prereleases to next dist-tag, enforces skip-existing, git clean guard, and 10-asset attestation before upload', () => {
  const releaseDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));

  for (const jobId of ['publish-npm', 'publish-gpr']) {
    const steps = releaseDoc?.jobs?.[jobId]?.steps || [];
    const pubStep = steps.find((s) => typeof s.run === 'string' && s.run.includes('npm publish'));
    assert.ok(pubStep, `Expected npm publish step in ${jobId}`);
    assert.match(pubStep.run, /DIST_TAG="latest"/);
    assert.match(pubStep.run, /if \[\[ "\$PKG_VER" == \*-\* \]\]; then\s+DIST_TAG="next"/);
    assert.match(pubStep.run, /npm publish --tag "\$DIST_TAG"/);
  }

  const pypiSteps = releaseDoc?.jobs?.['publish-pypi']?.steps || [];
  const pypiPublish = pypiSteps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('pypa/gh-action-pypi-publish@'));
  assert.ok(pypiPublish, 'Expected pypa/gh-action-pypi-publish step in publish-pypi');
  assert.equal(pypiPublish.with?.['skip-existing'], true);

  const attachSteps = releaseDoc?.jobs?.['attach-assets']?.steps || [];
  const genIdx = attachSteps.findIndex((s) => s.name === 'Generate game assets and package zip bundles');
  const attestIdx = attachSteps.findIndex((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/attest@'));
  const uploadIdx = attachSteps.findIndex((s) => s.name === 'Upload release assets to GitHub Release');
  assert.ok(genIdx !== -1, 'Expected generate step in attach-assets');
  assert.ok(attestIdx !== -1, 'Expected actions/attest step in attach-assets');
  assert.ok(uploadIdx !== -1, 'Expected Upload release assets to GitHub Release step in attach-assets');
  assert.ok(
    genIdx < attestIdx && attestIdx < uploadIdx,
    `Expected generate (${genIdx}) -> attest (${attestIdx}) -> upload (${uploadIdx}) step ordering in attach-assets`,
  );

  const genStep = attachSteps[genIdx];
  assert.match(genStep.run, /test -z "\$\(git status --porcelain\)"/);

  const attestStep = attachSteps[attestIdx];
  const subjectLines = String(attestStep.with?.['subject-path'] || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  assert.deepEqual(subjectLines, [
    'dist/assets/*.zip',
    'dist/SHA256SUMS.txt',
    'dist/manifest.json',
    'dist/sri.json',
    'dist/css/tol.css',
    'dist/js/index.js',
    'dist/json/schemes.json',
    'dist/py/tol_palettes.py',
  ]);
});

function buildReleaseFixture({
  workflowEnv = '',
  jobPermissions = '      contents: read\n      id-token: write\n',
  jobEnvironment = '    environment:\n      name: npm\n      url: https://www.npmjs.com/package/@kidthales/tol-palettes\n',
  jobEnv = '',
  includeSetupNode = true,
  nodeVersion = 24,
  stepEnv = '',
  publishRun = 'npm publish --tag latest --provenance --access public',
} = {}) {
  const setupNodeBlock = includeSetupNode
    ? `      - name: Setup Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
        with:
          node-version: ${nodeVersion}
          package-manager-cache: false
`
    : '';

  return `name: Release
permissions:
  contents: read
concurrency:
  group: release-\${{ github.repository }}
  cancel-in-progress: false
${workflowEnv}jobs:
  tag-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Verify release tag matches project metadata versions
        run: exit 1
  verify:
    needs: [tag-guard]
    uses: ./.github/workflows/ci.yml
  publish-npm:
    needs: [verify]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
${jobPermissions}${jobEnvironment}${jobEnv}    steps:
${setupNodeBlock}      - name: Publish to npm (Idempotent with Provenance)
${stepEnv}        run: |
          ${publishRun}
`;
}

test('auditWorkflows enforces publish-npm tokenless OIDC invariants (positive and negative)', () => {
  withTempFixture({ 'release.yml': buildReleaseFixture() }, (dir) => {
    const res = auditWorkflows(dir);
    assert.equal(res.ok, true, `Expected valid OIDC publish-npm fixture to pass, got: ${res.violations.join('; ')}`);
    assert.equal(res.violations.length, 0);
  });

  const negativeCases = [
    {
      name: 'missing id-token: write permission',
      opts: { jobPermissions: '      contents: read\n' },
      expected: 'permissions.id-token: write',
    },
    {
      name: 'missing environment block',
      opts: { jobEnvironment: '' },
      expected: "must declare environment 'npm'",
    },
    {
      name: 'non-npm environment name',
      opts: { jobEnvironment: '    environment:\n      name: staging\n' },
      expected: "must declare environment 'npm'",
    },
    {
      name: 'wrong setup-node node-version (22 instead of 24)',
      opts: { nodeVersion: 22 },
      expected: 'must set node-version: 24',
    },
    {
      name: 'missing actions/setup-node step',
      opts: { includeSetupNode: false },
      expected: 'must include actions/setup-node with node-version: 24',
    },
    {
      name: 'step-level NODE_AUTH_TOKEN env binding',
      opts: { stepEnv: '        env:\n          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\n' },
      expected: "must not bind forbidden env 'NODE_AUTH_TOKEN'",
    },
    {
      name: 'job-level NPM_TOKEN env binding',
      opts: { jobEnv: '    env:\n      NPM_TOKEN: \${{ secrets.NPM_TOKEN }}\n' },
      expected: "must not bind forbidden env 'NPM_TOKEN'",
    },
    {
      name: 'workflow-level NPM_TOKEN env binding',
      opts: { workflowEnv: 'env:\n  NPM_TOKEN: \${{ secrets.NPM_TOKEN }}\n' },
      expected: "must not bind forbidden env 'NPM_TOKEN'",
    },
    {
      name: 'inline run script NODE_AUTH_TOKEN assignment',
      opts: { publishRun: 'NODE_AUTH_TOKEN="" npm publish --provenance --access public' },
      expected: 'must not assign NODE_AUTH_TOKEN or NPM_TOKEN',
    },
    {
      name: 'step-level NPM_CONFIG__AUTHTOKEN env binding',
      opts: { stepEnv: '        env:\n          NPM_CONFIG__AUTHTOKEN: \${{ secrets.NPM_TOKEN }}\n' },
      expected: "must not bind forbidden env 'NPM_CONFIG__AUTHTOKEN'",
    },
    {
      name: 'step-level lowercase npm_config__authtoken env binding',
      opts: { stepEnv: '        env:\n          npm_config__authtoken: \${{ secrets.NPM_TOKEN }}\n' },
      expected: "must not bind forbidden env 'npm_config__authtoken'",
    },
    {
      name: 'inline run script NPM_CONFIG__AUTHTOKEN assignment',
      opts: { publishRun: 'NPM_CONFIG__AUTHTOKEN="tok" npm publish --provenance --access public' },
      expected: 'must not assign NPM_CONFIG__AUTHTOKEN',
    },
    {
      name: 'inline run script --_authToken= CLI flag',
      opts: { publishRun: 'npm publish --_authToken="tok" --provenance --access public' },
      expected: 'must not pass --_authToken CLI flag',
    },
    {
      name: 'inline run script registry-scoped --_authToken= CLI flag',
      opts: { publishRun: 'npm publish --//registry.npmjs.org/:_authToken="tok" --provenance --access public' },
      expected: 'must not pass --_authToken CLI flag',
    },
  ];

  for (const tc of negativeCases) {
    withTempFixture({ 'release.yml': buildReleaseFixture(tc.opts) }, (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false, `Expected negative case "${tc.name}" to fail Gate 0`);
      assert.ok(
        res.violations.some((v) => v.includes(tc.expected)),
        `Expected "${tc.name}" violation to include "${tc.expected}", got: ${res.violations.join('; ')}`,
      );
    });
  }
});

test('release.yml publish-npm uses tokenless OIDC trusted publishing and fail-closed npm >= 11.5.1 guard', () => {
  const releaseDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));

  assert.equal(Object.hasOwn(releaseDoc?.env || {}, 'NODE_AUTH_TOKEN'), false);
  assert.equal(Object.hasOwn(releaseDoc?.env || {}, 'NPM_TOKEN'), false);

  const pubNpm = releaseDoc?.jobs?.['publish-npm'];
  assert.ok(pubNpm, 'Expected publish-npm job in release.yml');
  assert.equal(pubNpm.permissions?.contents, 'read');
  assert.equal(pubNpm.permissions?.['id-token'], 'write');
  assert.deepEqual(pubNpm.environment, {
    name: 'npm',
    url: 'https://www.npmjs.com/package/@kidthales/tol-palettes',
  });
  assert.equal(Object.hasOwn(pubNpm.env || {}, 'NODE_AUTH_TOKEN'), false);
  assert.equal(Object.hasOwn(pubNpm.env || {}, 'NPM_TOKEN'), false);

  const steps = pubNpm.steps || [];
  const setupNode = steps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-node@'));
  assert.ok(setupNode, 'Expected actions/setup-node step in publish-npm');
  assert.equal(setupNode.with?.['node-version'], 24);
  assert.equal(setupNode.with?.['registry-url'], 'https://registry.npmjs.org');
  assert.equal(setupNode.with?.['package-manager-cache'], false);

  for (const step of steps) {
    assert.equal(Object.hasOwn(step.env || {}, 'NODE_AUTH_TOKEN'), false);
    assert.equal(Object.hasOwn(step.env || {}, 'NPM_TOKEN'), false);
    if (typeof step.run === 'string') {
      assert.equal(/\b(?:NODE_AUTH_TOKEN|NPM_TOKEN)\b/.test(step.run), false);
    }
  }

  const pubStep = steps.find((s) => s.name === 'Publish to npm (Idempotent with Provenance)');
  assert.ok(pubStep, 'Expected Publish to npm (Idempotent with Provenance) step');
  assert.match(pubStep.run, /npm publish --tag "\$DIST_TAG" --provenance --access public/);

  const guardMatch = pubStep.run.match(/if ! node -e '([^']+)' "\$NPM_VER"; then/);
  assert.ok(guardMatch, 'Expected fail-closed inline node -e npm >= 11.5.1 guard in publish-npm');
  const guardScript = guardMatch[1];

  for (const validVer of ['11.5.1', '11.5.1+build.1', '11.5.2-rc.0', '11.5.2', '11.6.0', '12.0.0']) {
    const res = spawnSync(process.execPath, ['-e', guardScript, validVer], { encoding: 'utf8' });
    assert.equal(res.status, 0, `Expected npm version ${validVer} to pass OIDC version guard`);
  }
  for (const invalidVer of ['11.5.1-rc.0', '11.5.1-0', '11.5.1foo', '11.5.1.0', '11.5.0', '11.4.9', '10.9.2', '0.0.0', 'not-a-semver']) {
    const res = spawnSync(process.execPath, ['-e', guardScript, invalidVer], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, `Expected npm version ${invalidVer} to fail OIDC version guard`);
  }
});

test('.github/zizmor.yml scopes use-trusted-publishing to publish-gpr npm publish line without drift and scopes self-repository to bare workflow filenames', () => {
  const zizmorPath = join(root, '.github', 'zizmor.yml');
  assert.equal(existsSync(zizmorPath), true, 'Expected .github/zizmor.yml to exist');

  const zizmorDoc = parseYaml(readFileSync(zizmorPath, 'utf8'));
  const trustedIgnore = zizmorDoc?.rules?.['use-trusted-publishing']?.ignore;
  assert.ok(Array.isArray(trustedIgnore), 'Expected rules.use-trusted-publishing.ignore array in .github/zizmor.yml');
  assert.equal(trustedIgnore.length, 1, 'Expected use-trusted-publishing ignore to pin strictly 1 line in release.yml');

  const linePinMatch = String(trustedIgnore[0]).match(/^release\.yml:(\d+)$/);
  assert.ok(linePinMatch, `Expected release.yml:<line> entry, got: ${trustedIgnore[0]}`);
  const pinnedLineNum = Number(linePinMatch[1]);

  const releaseText = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.equal(releaseText.includes('# zizmor: ignore'), false, 'release.yml must not contain inline # zizmor: ignore comments');

  const releaseLines = releaseText.split(/\r?\n/);
  assert.ok(pinnedLineNum >= 1 && pinnedLineNum <= releaseLines.length, `Pinned line ${pinnedLineNum} out of range`);

  const publishGprStart = releaseLines.findIndex((l) => /^\s{2}publish-gpr:\s*$/.test(l)) + 1;
  const publishPypiStart = releaseLines.findIndex((l) => /^\s{2}publish-pypi:\s*$/.test(l)) + 1;
  assert.ok(publishGprStart > 0 && publishPypiStart > publishGprStart, 'Expected publish-gpr before publish-pypi in release.yml');
  assert.ok(
    pinnedLineNum > publishGprStart && pinnedLineNum < publishPypiStart,
    `Expected zizmor ignore line ${pinnedLineNum} to fall within publish-gpr (${publishGprStart}..${publishPypiStart})`,
  );

  const targetLine = releaseLines[pinnedLineNum - 1].trim();
  assert.match(
    targetLine,
    /^npm publish\b.*--registry=https:\/\/npm\.pkg\.github\.com\/$/,
    `Expected release.yml:${pinnedLineNum} to be publish-gpr's npm publish command, got: ${targetLine}`,
  );

  const selfRepoIgnore = zizmorDoc?.rules?.['self-repository']?.ignore;
  assert.deepEqual(selfRepoIgnore, ['pages.yml', 'release.yml']);
  for (const wfFile of selfRepoIgnore) {
    assert.equal(existsSync(join(root, '.github', 'workflows', wfFile)), true, `Expected ${wfFile} to exist`);
  }
});
