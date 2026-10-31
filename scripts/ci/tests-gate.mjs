#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const VALID_RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

function parseBoolean(value, name, allowEmpty = false) {
  if (value === 'true') return true;
  if (value === 'false' || (allowEmpty && value === '')) return false;
  throw new Error(`${name} must be "true" or "false"; received "${value}"`);
}

function readResult(env, key) {
  const result = env[key];
  if (!VALID_RESULTS.has(result)) {
    throw new Error(
      `${key} must be a GitHub job result; received "${result ?? ''}"`,
    );
  }
  return result;
}

export function createTestsGateJobs(env) {
  const planResult = readResult(env, 'PLAN_RESULT');
  // Plan outputs are empty when the plan job never finished; a failed,
  // skipped, or cancelled plan fails the gate on its own row.
  const allowEmptyPlan = planResult !== 'success';
  const planned = (key) => parseBoolean(env[key], key, allowEmptyPlan);

  return [
    {
      // Trust check, heavy-tier resolution, test plan, and spec scope.
      name: 'Plan',
      result: planResult,
      applicable: true,
    },
    {
      // Gitleaks, format, secretlint, lint, typecheck, and the executable
      // contracts run in one consolidated job (#1969).
      name: 'Static checks',
      result: readResult(env, 'STATIC_CHECKS_RESULT'),
      applicable: true,
    },
    {
      // Spec files are invisible to the Typecheck step inside Static checks.
      // This row must stay in the aggregate: the master failure tracker keys
      // off the gate, so a missing row let a red Spec Typecheck close the open
      // trackers (run 32971423541).
      name: 'Spec typecheck',
      result: readResult(env, 'SPEC_TYPECHECK_RESULT'),
      applicable: planned('PLAN_SPEC_TYPECHECK'),
    },
    {
      // Build, plus the OpenAPI drift gate whenever the API is in scope.
      name: 'Build',
      result: readResult(env, 'BUILD_RESULT'),
      applicable: true,
    },
    {
      name: 'Workspace tests',
      result: readResult(env, 'TEST_WORKSPACES_RESULT'),
      applicable: planned('PLAN_WORKSPACE_TESTS'),
    },
    {
      name: 'App tests',
      result: readResult(env, 'TEST_APP_RESULT'),
      applicable: planned('PLAN_APP_TESTS'),
    },
    {
      name: 'API tests',
      result: readResult(env, 'TEST_API_RESULT'),
      applicable: planned('PLAN_API_TESTS'),
    },
    {
      name: 'Cloud Tenant Guard Sweep',
      result: readResult(env, 'CLOUD_TENANT_GUARD_RESULT'),
      applicable: planned('PLAN_API_TESTS'),
    },
    {
      name: 'MCP Auth Runtime',
      result: readResult(env, 'MCP_AUTH_RUNTIME_RESULT'),
      applicable: planned('PLAN_MCP_AUTH_RUNTIME'),
    },
  ];
}

/**
 * A pull request run cancelled because a newer push replaced it. Read from
 * the gate job's supersession step; empty (never superseded) on merge-queue
 * and master runs, so their cancellations keep failing the gate.
 */
export function readSupersession(env) {
  const superseded = parseBoolean(
    env.RUN_SUPERSEDED ?? '',
    'RUN_SUPERSEDED',
    true,
  );
  const supersededBy = env.SUPERSEDED_BY?.trim() || null;
  return { superseded, supersededBy };
}

// Classifications a newer push can cause on its own: cancelled jobs, and
// applicable jobs that never ran because a cancelled job upstream was skipped.
const SUPERSESSION_CLASSIFICATIONS = new Set(['cancelled', 'missing']);

export function evaluateTestsGate(
  jobs,
  { superseded = false, supersededBy = null } = {},
) {
  const failures = [];
  const rows = [];

  for (const job of jobs) {
    const { name, result, applicable } = job;

    if (!VALID_RESULTS.has(result)) {
      failures.push(`${name} reported an unknown result: ${result}`);
      rows.push({ ...job, classification: 'invalid' });
      continue;
    }

    if (result === 'failure' || result === 'cancelled') {
      failures.push(`${name} ${result}`);
      rows.push({ ...job, classification: result });
      continue;
    }

    if (applicable && result !== 'success') {
      failures.push(`${name} was applicable but ${result}`);
      rows.push({ ...job, classification: 'missing' });
      continue;
    }

    const classification = result === 'skipped' ? 'not applicable' : 'passed';

    rows.push({ ...job, classification });
  }

  // A superseded pull request run is not evaluated: branch protection reads
  // the Tests Gate on the new head, and a red gate here only marks an old
  // commit as broken when nothing failed. A job that genuinely failed before
  // the newer push still fails the gate.
  const isSupersededOnly =
    superseded &&
    failures.length > 0 &&
    rows.every(
      (row) =>
        SUPERSESSION_CLASSIFICATIONS.has(row.classification) ||
        row.classification === 'passed' ||
        row.classification === 'not applicable',
    );

  if (isSupersededOnly) {
    return {
      passed: true,
      superseded: true,
      supersededBy,
      failures: [],
      rows,
    };
  }

  return {
    passed: failures.length === 0,
    failures,
    rows,
  };
}

export function formatTestsGateSummary(evaluation) {
  const lines = [
    '# Tests Gate',
    '',
    '| Job | Expected | Result | Classification |',
    '| --- | --- | --- | --- |',
  ];

  for (const row of evaluation.rows) {
    lines.push(
      `| ${row.name} | ${row.applicable ? 'applicable' : 'not applicable'} | ${row.result} | ${row.classification} |`,
    );
  }

  let verdict = evaluation.passed
    ? 'All applicable test and build jobs passed.'
    : `Gate failures: ${evaluation.failures.join('; ')}.`;
  if (evaluation.superseded) {
    const newer = evaluation.supersededBy
      ? `commit ${evaluation.supersededBy.slice(0, 12)}`
      : 'a newer push';
    verdict =
      `Superseded by ${newer}: this run was cancelled before it finished, so ` +
      'its jobs are not evaluated. The Tests Gate on the newer commit decides.';
  }
  lines.push('', verdict);

  return `${lines.join('\n')}\n`;
}

function runCli() {
  let evaluation;

  try {
    evaluation = evaluateTestsGate(
      createTestsGateJobs(process.env),
      readSupersession(process.env),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const summary = formatTestsGateSummary(evaluation);
  process.stdout.write(summary);

  if (!evaluation.passed) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
