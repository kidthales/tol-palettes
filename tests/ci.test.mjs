import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
`,
    },
    (dir) => {
      const res = auditWorkflows(dir);
      assert.equal(res.ok, false);
      assert.ok(res.violations.some((v) => v.includes("tag-guard step must fail closed with 'exit 1'")));
      assert.ok(res.violations.some((v) => v.includes("verify job must declare needs: [tag-guard]")));
      assert.ok(res.violations.some((v) => v.includes("must set package-manager-cache: false")));
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
