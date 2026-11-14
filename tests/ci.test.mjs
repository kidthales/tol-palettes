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

test('valid repository workflows pass Gate 0', () => {
  const res = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-Gate0Only'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
  const combined = (res.stdout || '') + (res.stderr || '');
  assert.equal(res.status, 0, `Expected Gate 0 to pass on repo workflows. Output: ${combined}`);
  assert.ok(combined.includes('All workflow run steps conform'), 'Expected success confirmation');
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

  const shaPattern = /@[0-9a-fA-F]{40}/;

  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)['"]?/);
      if (match) {
        const actionRef = match[1];
        if (
          actionRef.startsWith('./') ||
          actionRef.startsWith('../') ||
          actionRef.startsWith('$/') ||
          actionRef.startsWith('docker://')
        ) {
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

test('auditWorkflows and ci-local.ps1 reject $/ workflow targets with @ref and $/ in steps', () => {
  withTempFixture(
    {
      'dollar_ref.yml': `name: DollarRef
permissions:
  contents: read
jobs:
  call:
    uses: $/.github/workflows/ci.yml@main
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("same-repository workflow references must not specify an @ref")));

      // Also verify ci-local.ps1 Gate 1 rejects it
      const psRes = spawnSync('pwsh', ['-NoProfile', '-File', scriptPath, '-WorkflowsPath', dir], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: '' },
      });
      assert.notEqual(psRes.status, 0);
      const combined = (psRes.stdout || '') + (psRes.stderr || '');
      assert.ok(combined.includes("same-repository workflow references must not specify an @ref"));
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
      assert.ok(res.violations.some((v) => v.includes("only valid for reusable workflow calls at job level")));
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
    uses: $/.github/workflows/ci.yml
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
    uses: $/.github/workflows/ci.yml
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

test('ci.yml spans Python 3.11-3.14 across 4 matrix legs and requirements-ci pins matplotlib==3.11.2', () => {
  const ciDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'));
  const include = ciDoc?.jobs?.verify?.strategy?.matrix?.include;
  assert.ok(Array.isArray(include), 'Expected verify.strategy.matrix.include array in ci.yml');
  assert.equal(include.length, 4, 'Expected exactly 4 matrix legs in ci.yml');

  const pythonVersions = include.map((leg) => String(leg.python)).sort();
  assert.deepEqual(pythonVersions, ['3.11', '3.12', '3.13', '3.14']);

  const reqs = readFileSync(join(root, 'requirements-ci.txt'), 'utf8');
  assert.match(reqs, /^matplotlib==3\.11\.2\s*$/m, 'Expected matplotlib==3.11.2 pin in requirements-ci.txt');
});

test('release.yml locks all actions/checkout steps to target tag ref and resolves notify tag', () => {
  const releaseDoc = parseYaml(readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8'));
  const expectedRef = '${{ github.event.release.tag_name || inputs.tag || github.ref }}';
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

  const notifySteps = releaseDoc?.jobs?.notify?.steps || [];
  assert.equal(notifySteps.length, 1);
  const notifyStep = notifySteps[0];
  assert.equal(notifyStep.env?.RELEASE_TAG, '${{ github.event.release.tag_name }}');
  assert.equal(notifyStep.env?.DISPATCH_TAG, '${{ inputs.tag }}');
  assert.equal(notifyStep.env?.REF_NAME, '${{ github.ref_name }}');
  assert.match(notifyStep.run, /TAG_NAME="\$\{RELEASE_TAG:-\$\{DISPATCH_TAG:-\$REF_NAME\}\}"/);
});

test('release.yml tag-guard regex accepts valid SemVer/prerelease tags, rejects invalid formats, and checks PEP 440 parity', () => {
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
});

test('release.yml routes prereleases to next dist-tag, enforces skip-existing, git clean guard, and 10-asset attestation', () => {
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
  const genStep = attachSteps.find((s) => s.name === 'Generate game assets and package zip bundles');
  assert.ok(genStep, 'Expected generate step in attach-assets');
  assert.match(genStep.run, /test -z "\$\(git status --porcelain\)"/);

  const attestStep = attachSteps.find((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/attest@'));
  assert.ok(attestStep, 'Expected actions/attest step in attach-assets');
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
