// YAML AST Workflow Drift and Security Auditor for @kidthales/tol-palettes
// Enforces structural permissions, commit SHA pinning, checkout hygiene,
// script injection safety, Gate 0 single-source execution, timeout-minutes bounds,
// and workflow contracts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const DEFAULT_MAX_TIMEOUT_MINUTES = 30;

// Exact job-id/step-name allowlist pairs for non-verify steps
export const EXACT_STEP_ALLOWLIST = new Set([
  'notify/Dispatch consolidated status card to #dev-ci-builds',
  'notify/Dispatch consolidated status card to',
  'notify/Dispatch Pages deployment status card to #dev-ci-builds',
  'notify/Dispatch Pages deployment status card to',
  'notify/Dispatch release status card to #dev-ci-builds',
  'notify/Dispatch release status card to',
  'tag-guard/Verify release tag matches project metadata versions',
  'verify/Install dependencies',
  'verify/Install Python build tools and matplotlib',
  'verify/Install Python build tools and dependencies',
  'build/Install dependencies',
  'build/Generate static gallery',
  'build/generate:gallery',
  'publish-npm/Install dependencies',
  'publish-npm/Publish to npm (Idempotent with Provenance)',
  'publish-gpr/Install dependencies',
  'publish-gpr/Publish to GitHub Packages (Idempotent)',
  'publish-pypi/Install build tool',
  'publish-pypi/Build sdist and wheel',
  'attach-assets/Install dependencies',
  'attach-assets/Generate game assets and package zip bundles',
  'attach-assets/package:assets',
  'attach-assets/Package release asset bundles',
  'attach-assets/Upload zip bundles to GitHub Release',
  'attach-assets/Upload release assets to GitHub Release',
]);

// Canonical single-source CI invocation strings accepted without allowlisting
export const CANONICAL_CI_RUNS = new Set([
  './scripts/ci-local.ps1 -CI',
  'pwsh ./scripts/ci-local.ps1 -CI',
  'pwsh -File ./scripts/ci-local.ps1 -CI',
]);

// Forbidden direct test/lint/pack commands in run steps outside canonical CI
export const FORBIDDEN_COMMAND_PATTERNS = [
  { name: 'npm test', regex: /\bnpm\s+test\b/ },
  { name: 'node --test', regex: /\bnode\s+--test\b/ },
  { name: 'npm run lint', regex: /\bnpm\s+run\s+lint\b/ },
  { name: 'npm run validate', regex: /\bnpm\s+run\s+validate\b/ },
  { name: 'npm pack', regex: /\bnpm\s+pack\b/ },
];

/**
 * Checks whether a string contains any ${{ ... }} expression.
 * In GitHub Actions, expressions are expanded before invocation and backslash escaping
 * does not prevent evaluation. Any expression in a shell script block is flagged.
 */
export function hasUnescapedExpression(str) {
  if (typeof str !== 'string') return false;
  return /\$\{\{[\s\S]*?\}\}/.test(str);
}

/**
 * Checks if a write permission scope is authorized for a specific workflow and job.
 */
function isAuthorizedJobWrite(fileName, jobId, scope) {
  const base = basename(fileName);
  if (scope === 'security-events') {
    return jobId === 'security' || jobId === 'verify';
  }
  if (scope === 'pages') {
    return base === 'pages.yml' && jobId === 'deploy';
  }
  if (scope === 'id-token') {
    return (
      (base === 'pages.yml' && jobId === 'deploy') ||
      (base === 'release.yml' && (jobId === 'publish-npm' || jobId === 'publish-pypi' || jobId === 'attach-assets'))
    );
  }
  if (scope === 'packages') {
    return base === 'release.yml' && jobId === 'publish-gpr';
  }
  if (scope === 'contents') {
    return base === 'release.yml' && jobId === 'attach-assets';
  }
  if (scope === 'attestations') {
    return base === 'release.yml' && jobId === 'attach-assets';
  }
  return false;
}

/**
 * Audits all workflow YAML files in target directory or project root.
 * Returns an array of violation strings augmented with .ok and .violations properties.
 */
export function auditWorkflows(targetPath, options = {}) {
  const violations = [];
  const maxTimeout = options.maxTimeoutMinutes || DEFAULT_MAX_TIMEOUT_MINUTES;

  let workflowsDir = options.workflowsDir || targetPath;
  if (!workflowsDir) {
    workflowsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
  }

  if (existsSync(workflowsDir)) {
    const stat = statSync(workflowsDir);
    if (stat.isDirectory()) {
      const nested = join(workflowsDir, '.github', 'workflows');
      if (existsSync(nested)) {
        workflowsDir = nested;
      }
    }
  }

  if (!existsSync(workflowsDir)) {
    const err = `Workflows directory not found: ${workflowsDir}`;
    const res = [err];
    res.ok = false;
    res.violations = res;
    return res;
  }

  const entries = readdirSync(workflowsDir, { withFileTypes: true });
  const wfFiles = entries
    .filter((e) => e.isFile() && (e.name.endsWith('.yml') || e.name.endsWith('.yaml')))
    .map((e) => join(workflowsDir, e.name));

  if (wfFiles.length === 0) {
    const err = `Gate 0 failed: no workflow files (*.yml, *.yaml) found in ${workflowsDir}`;
    const res = [err];
    res.ok = false;
    res.violations = res;
    return res;
  }

  for (const wfPath of wfFiles) {
    const wfName = basename(wfPath);
    let content = '';
    try {
      content = readFileSync(wfPath, 'utf8');
    } catch (err) {
      violations.push(`${wfName}: cannot read file: ${err.message}`);
      continue;
    }

    let doc;
    try {
      doc = parse(content);
    } catch (err) {
      violations.push(`${wfName}: YAML parse error: ${err.message}`);
      continue;
    }

    if (!doc || typeof doc !== 'object') {
      violations.push(`${wfName}: empty or invalid workflow root`);
      continue;
    }

    // 1. Root permissions check: must be strictly { contents: read }
    if (!doc.permissions) {
      violations.push(`${wfName}: missing top-level permissions block (must be permissions: { contents: read })`);
    } else if (typeof doc.permissions === 'string') {
      violations.push(`${wfName}: top-level permissions cannot be string '${doc.permissions}' (must be permissions: { contents: read })`);
    } else if (typeof doc.permissions === 'object') {
      const keys = Object.keys(doc.permissions);
      if (keys.length !== 1 || doc.permissions.contents !== 'read') {
        violations.push(`${wfName}: top-level permissions must be strictly '{ contents: read }' (got ${JSON.stringify(doc.permissions)})`);
      }
    }

    const jobs = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};

    for (const [jobId, job] of Object.entries(jobs)) {
      if (!job || typeof job !== 'object') {
        violations.push(`${wfName}: job '${jobId}' is invalid or empty`);
        continue;
      }

      const hasSteps = Array.isArray(job.steps) && job.steps.length > 0;

      // 2. Timeout-minutes enforcement on every job that runs steps
      if (hasSteps || (!job.uses && !job.strategy?.matrix)) {
        const timeout = job['timeout-minutes'];
        if (timeout === undefined || timeout === null) {
          violations.push(`${wfName}: job '${jobId}' missing 'timeout-minutes' (must be positive integer <= ${maxTimeout})`);
        } else if (!Number.isInteger(timeout) || timeout < 1 || timeout > maxTimeout) {
          violations.push(`${wfName}: job '${jobId}' has invalid 'timeout-minutes' (${timeout}), must be positive integer <= ${maxTimeout}`);
        }
      }

      // 3. Job permissions check (must be explicitly declared, zero unauthorized write permissions)
      if (hasSteps) {
        if (!job.permissions) {
          violations.push(`${wfName}: job '${jobId}' missing explicit job-level permissions block`);
        } else if (typeof job.permissions === 'string') {
          if (job.permissions === 'write-all') {
            violations.push(`${wfName}: job '${jobId}' has unauthorized write-all permissions`);
          }
        } else if (typeof job.permissions === 'object') {
          for (const [scope, level] of Object.entries(job.permissions)) {
            if (level === 'write' && !isAuthorizedJobWrite(wfName, jobId, scope)) {
              violations.push(`${wfName}: job '${jobId}' has unauthorized write permission for scope '${scope}'`);
            }
          }
        }
      }

      // Job-level reusable workflow call check
      if (job.uses) {
        const u = String(job.uses);
        if (u.startsWith('$/') || u.startsWith('./')) {
          if (u.includes('..') || u.includes('\\')) {
            violations.push(`${wfName}: job '${jobId}' uses non-canonical workflow path '${u}'`);
          }
          if (u.startsWith('$/') && u.includes('@')) {
            violations.push(`${wfName}: job '${jobId}' uses invalid workflow target '${u}' ('$/' same-repository workflow references must not specify an @ref)`);
          }
        } else if (u.startsWith('../')) {
          violations.push(`${wfName}: job '${jobId}' uses non-canonical relative workflow path '${u}' (must start with '$/' or './')`);
        } else if (u.startsWith('docker://')) {
          if (!/@sha256:[0-9a-fA-F]{64}$/.test(u)) {
            violations.push(`${wfName}: job '${jobId}' uses unpinned docker action '${u}' (must pin to @sha256 digest)`);
          }
        } else {
          const atIdx = u.lastIndexOf('@');
          const sha = atIdx !== -1 ? u.slice(atIdx + 1).trim() : '';
          if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
            violations.push(`${wfName}: job '${jobId}' uses unpinned reusable workflow '${u}' (must pin to 40-char commit SHA)`);
          }
        }
      }

      const steps = Array.isArray(job.steps) ? job.steps : [];
      let jobRunsCanonicalCi = false;

      for (const step of steps) {
        if (!step || typeof step !== 'object') continue;
        const stepName = step.name || 'unnamed';

        // 4. Action uses pinning and canonical path checks
        if (step.uses) {
          const uses = String(step.uses);
          if (uses.startsWith('$/')) {
            violations.push(`${wfName}: step '${stepName}' uses '$/' which is only valid for reusable workflow calls at job level ('${uses}')`);
          } else if (uses.startsWith('./')) {
            if (uses.includes('..') || uses.includes('\\')) {
              violations.push(`${wfName}: step '${stepName}' uses non-canonical local action path '${uses}'`);
            }
          } else if (uses.startsWith('../')) {
            violations.push(`${wfName}: step '${stepName}' uses non-canonical relative path '${uses}' (must start with './')`);
          } else if (uses.startsWith('docker://')) {
            if (!/@sha256:[0-9a-fA-F]{64}$/.test(uses)) {
              violations.push(`${wfName}: step '${stepName}' uses unpinned docker action '${uses}' (must pin to @sha256 digest)`);
            }
          } else {
            const atIdx = uses.lastIndexOf('@');
            const sha = atIdx !== -1 ? uses.slice(atIdx + 1).trim() : '';
            if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
              violations.push(`${wfName}: step '${stepName}' uses unpinned action '${uses}' (must pin to 40-char commit SHA)`);
            }
          }

          // 5. actions/checkout persist-credentials check
          if (uses.startsWith('actions/checkout@')) {
            if (!step.with || step.with['persist-credentials'] !== false) {
              violations.push(`${wfName}: step '${stepName}' uses actions/checkout without persist-credentials: false`);
            }
          }
        }

        // 6. Script execution checks
        if (step.run !== undefined) {
          const rawRun = String(step.run).trim();

          // Zero unescaped expression check
          if (hasUnescapedExpression(rawRun)) {
            violations.push(`${wfName}: job '${jobId}' step '${stepName}' contains unescaped expression in run script`);
          }

          // Check for forbidden direct test/lint commands outside canonical CI
          for (const cmd of FORBIDDEN_COMMAND_PATTERNS) {
            if (cmd.regex.test(rawRun)) {
              violations.push(`${wfName}: job '${jobId}' step '${stepName}' runs forbidden direct test/lint/pack command in run script outside ci-local.ps1 -CI (${cmd.name})`);
            }
          }

          // Check canonical runner vs allowlist
          const isCanonical = CANONICAL_CI_RUNS.has(rawRun);
          const pairKey = `${jobId}/${stepName}`;
          const isAllowlisted = EXACT_STEP_ALLOWLIST.has(pairKey);

          if (isCanonical) {
            jobRunsCanonicalCi = true;
          }

          if (!isCanonical && !isAllowlisted) {
            violations.push(`${wfName}: job '${jobId}' step '${stepName}' runs inline script ('${rawRun}') instead of './scripts/ci-local.ps1 -CI' and pair '${pairKey}' is not in the Gate 0 exact allowlist.`);
          }
        }

        // Script block in action inputs (e.g. actions/github-script)
        if (step.with && typeof step.with === 'object' && step.with.script) {
          if (hasUnescapedExpression(String(step.with.script))) {
            violations.push(`${wfName}: job '${jobId}' step '${stepName}' contains expression interpolation in action script input`);
          }
        }
      }

      // Verify job canonical CI runner contract
      if (jobId === 'test-and-build' || jobId === 'verify') {
        if (steps.length > 0 && !jobRunsCanonicalCi) {
          violations.push(`${wfName}: verify job '${jobId}' defines steps but does not invoke './scripts/ci-local.ps1 -CI'.`);
        } else if (steps.length === 0 && job.uses !== '$/.github/workflows/ci.yml') {
          violations.push(`${wfName}: verify job '${jobId}' must either invoke './scripts/ci-local.ps1 -CI' or call '$/.github/workflows/ci.yml' (got uses: '${job.uses || ''}').`);
        }
      }
    }

    // 7. Workflow-specific architectural contracts
    if (wfName === 'ci.yml') {
      // ci.yml: concurrency isolation
      if (!doc.concurrency) {
        violations.push(`${wfName}: missing top-level concurrency isolation block`);
      } else {
        if (!doc.concurrency.group) {
          violations.push(`${wfName}: concurrency missing group property`);
        }
        if (doc.concurrency['cancel-in-progress'] === undefined) {
          violations.push(`${wfName}: concurrency missing cancel-in-progress property`);
        }
      }

      // ci.yml: dedicated security job with gitleaks and zizmor
      if (!jobs.security) {
        violations.push(`${wfName}: missing dedicated 'security' job`);
      } else {
        const secSteps = Array.isArray(jobs.security.steps) ? jobs.security.steps : [];
        const hasGitleaks = secSteps.some((s) => s.uses && s.uses.includes('gitleaks/gitleaks-action'));
        const hasZizmor = secSteps.some((s) => s.uses && s.uses.includes('zizmorcore/zizmor-action'));
        if (!hasGitleaks) {
          violations.push(`${wfName}: security job missing gitleaks action`);
        }
        if (!hasZizmor) {
          violations.push(`${wfName}: security job missing zizmor action`);
        }
      }

      // ci.yml: notify workflow_call guard
      if (jobs.notify) {
        const ifCond = String(jobs.notify.if || '');
        if (!ifCond.includes("github.event_name != 'workflow_call'")) {
          violations.push(`${wfName}: notify job missing guard against workflow_call events (github.event_name != 'workflow_call')`);
        }
      }
    } else if (wfName === 'pages.yml') {
      // pages.yml: verify delegation
      if (!jobs.verify) {
        violations.push(`${wfName}: missing 'verify' job delegation`);
      } else if (jobs.verify.uses !== '$/.github/workflows/ci.yml') {
        violations.push(`${wfName}: verify job must delegate to '$/.github/workflows/ci.yml' (got '${jobs.verify.uses || ''}')`);
      }

      // pages.yml: build job needs verify
      if (jobs.build) {
        const needs = Array.isArray(jobs.build.needs) ? jobs.build.needs : [jobs.build.needs];
        if (!needs.includes('verify')) {
          violations.push(`${wfName}: build job must declare needs: [verify]`);
        }
      }

      // pages.yml: scoped deploy permissions
      if (jobs.deploy) {
        const perms = jobs.deploy.permissions;
        if (!perms || typeof perms !== 'object' || perms.pages !== 'write' || perms['id-token'] !== 'write') {
          violations.push(`${wfName}: deploy job must have scoped permissions: pages: write and id-token: write`);
        }
      }
    } else if (wfName === 'release.yml') {
      // release.yml: tag-guard fail-closed branches
      if (!jobs['tag-guard']) {
        violations.push(`${wfName}: missing 'tag-guard' job`);
      } else {
        const tgSteps = Array.isArray(jobs['tag-guard'].steps) ? jobs['tag-guard'].steps : [];
        const verifyStep = tgSteps.find((s) => s.name && s.name.includes('Verify release tag'));
        if (!verifyStep || !verifyStep.run || !verifyStep.run.includes('exit 1')) {
          violations.push(`${wfName}: tag-guard step must fail closed with 'exit 1' on empty tag or version mismatch`);
        }
      }

      // release.yml: verify delegation
      if (!jobs.verify) {
        violations.push(`${wfName}: missing 'verify' job delegation`);
      } else {
        const needs = Array.isArray(jobs.verify.needs) ? jobs.verify.needs : [jobs.verify.needs];
        if (!needs.includes('tag-guard')) {
          violations.push(`${wfName}: verify job must declare needs: [tag-guard]`);
        }
        if (jobs.verify.uses !== '$/.github/workflows/ci.yml') {
          violations.push(`${wfName}: verify job must delegate to '$/.github/workflows/ci.yml' (got '${jobs.verify.uses || ''}')`);
        }
      }

      // release.yml: package-manager-cache: false across all setup-node steps
      for (const [jobId, job] of Object.entries(jobs)) {
        for (const step of Array.isArray(job.steps) ? job.steps : []) {
          if (step.uses && step.uses.startsWith('actions/setup-node@')) {
            if (!step.with || step.with['package-manager-cache'] !== false) {
              violations.push(`${wfName}: job '${jobId}' step '${step.name || 'setup-node'}' must set package-manager-cache: false`);
            }
          }
        }
      }

      // release.yml: provenance attestation in attach-assets
      if (jobs['attach-assets']) {
        const aaSteps = Array.isArray(jobs['attach-assets'].steps) ? jobs['attach-assets'].steps : [];
        const hasAttestation = aaSteps.some((s) => s.uses && s.uses.startsWith('actions/attest@'));
        if (!hasAttestation) {
          violations.push(`${wfName}: attach-assets job missing actions/attest step`);
        }
      }
    }
  }

  const result = [...violations];
  result.ok = violations.length === 0;
  result.violations = violations;
  return result;
}

// CLI entrypoint
const isDirectCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectCli) {
  let targetDir = '';
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--workflows-dir' && i + 1 < process.argv.length) {
      targetDir = process.argv[++i];
    } else if (!arg.startsWith('-')) {
      targetDir = arg;
    }
  }

  const violations = auditWorkflows(targetDir);
  if (!violations.ok) {
    for (const v of violations) {
      console.error(`Gate 0 violation: ${v}`);
    }
    process.exit(1);
  }

  console.log('✔ Workflow audit passed: All workflows conform to AST drift and security invariants.');
  process.exit(0);
}
