#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { TEMPORARILY_DISABLED_TEST_GROUPS } from './pr-test-plan.mjs';

const VALID_RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

const DORMANT_CLASSIFICATION = 'dormant (paused surface)';

// Each entry carries the planner group key so the summary can tell a paused
// surface apart from a genuinely out-of-scope one. Without it every skip reads
// as "not applicable", and a `full-suite` run looks like it covered everything
// when a dormant workspace was never exercised (#2486).
const SCOPED_WORKSPACE_JOBS = [
  ['Package tests', 'TEST_PACKAGES_RESULT', 'TEST_SCOPE_PACKAGES', 'packages'],
  [
    'Server-service tests',
    'TEST_SERVER_SERVICES_RESULT',
    'TEST_SCOPE_SERVER_SERVICES',
    'server',
  ],
  [
    'Web and mobile tests',
    'TEST_WEB_DESKTOP_MOBILE_RESULT',
    'TEST_SCOPE_WEB_DESKTOP_MOBILE',
    'web',
  ],
  [
    'Extension tests',
    'TEST_EXTENSIONS_RESULT',
    'TEST_SCOPE_EXTENSIONS',
    'extensions',
  ],
];

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
  const testScopeResult = readResult(env, 'TEST_SCOPE_RESULT');
  const allowEmptyScope = testScopeResult !== 'success';
  const appScope = parseBoolean(
    env.TEST_SCOPE_APP,
    'TEST_SCOPE_APP',
    allowEmptyScope,
  );
  const apiScope = parseBoolean(
    env.TEST_SCOPE_API,
    'TEST_SCOPE_API',
    allowEmptyScope,
  );
  const appTests = parseBoolean(
    env.TEST_SCOPE_APP_TESTS,
    'TEST_SCOPE_APP_TESTS',
    allowEmptyScope,
  );
  const apiTests = parseBoolean(
    env.TEST_SCOPE_API_TESTS,
    'TEST_SCOPE_API_TESTS',
    allowEmptyScope,
  );
  // Empty when the scope job never finished (e.g. a cancelled run), like the
  // other scope outputs; a failed or cancelled scope job fails the gate anyway.
  const fullSuite = parseBoolean(env.FULL_SUITE, 'FULL_SUITE', allowEmptyScope);

  return [
    {
      name: 'Test scope',
      result: testScopeResult,
      applicable: true,
    },
    ...SCOPED_WORKSPACE_JOBS.map(([name, resultKey, scopeKey, groupKey]) => ({
      name,
      result: readResult(env, resultKey),
      applicable: parseBoolean(env[scopeKey], scopeKey, allowEmptyScope),
      dormant: TEMPORARILY_DISABLED_TEST_GROUPS.has(groupKey),
    })),
    {
      // Format, secretlint, lint, typecheck, and the executable contracts run
      // in one consolidated job (#1969); the gate holds their failure
      // semantics now that build no longer queues behind them.
      name: 'Static checks',
      result: readResult(env, 'STATIC_CHECKS_RESULT'),
      applicable: true,
    },
    {
      // Spec files are invisible to the Typecheck step inside Static checks —
      // every backend tsconfig.typecheck.json excludes them — so the ratchet
      // runs as its own job. It was absent from this aggregate, which let a red
      // Spec Typecheck report a green Tests Gate: the master failure tracker
      // keys off `tests-gate.result`, so run 32971423541 filed no tracker and
      // its resolve arm closed the open ones instead.
      name: 'Spec typecheck',
      result: readResult(env, 'SPEC_TYPECHECK_RESULT'),
      applicable: true,
    },
    {
      name: 'Build',
      result: readResult(env, 'BUILD_RESULT'),
      applicable: true,
    },
    {
      name: 'App tests (full matrix)',
      result: readResult(env, 'TEST_APP_RESULT'),
      applicable: appScope && fullSuite,
    },
    {
      name: 'App tests (changed)',
      result: readResult(env, 'TEST_APP_CHANGED_RESULT'),
      applicable: appTests && !fullSuite,
    },
    {
      name: 'API tests (full matrix)',
      result: readResult(env, 'TEST_API_RESULT'),
      applicable: apiScope && fullSuite,
    },
    {
      name: 'API tests (changed)',
      result: readResult(env, 'TEST_API_CHANGED_RESULT'),
      applicable: apiTests && !fullSuite,
    },
    {
      name: 'OpenAPI spec drift',
      result: readResult(env, 'OPENAPI_DRIFT_RESULT'),
      applicable: apiScope,
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

    // Dormancy relabels an accepted skip; it never softens a failure or an
    // applicable-but-missing job, both of which are handled above.
    let classification = 'passed';
    if (result === 'skipped') {
      classification = job.dormant ? DORMANT_CLASSIFICATION : 'not applicable';
    }

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
        row.classification === 'not applicable' ||
        row.classification === DORMANT_CLASSIFICATION,
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

  // Name the paused surfaces explicitly. A dormant workspace is skipped even on
  // a `full-suite` run, so "all applicable jobs passed" must not be read as
  // "every workspace was exercised" (#2486).
  const dormant = evaluation.rows.filter(
    (row) => row.classification === DORMANT_CLASSIFICATION,
  );

  if (dormant.length > 0) {
    lines.push(
      '',
      `Not covered by this run — paused surfaces: ${dormant
        .map((row) => row.name)
        .join(', ')}. These stay skipped even with the \`full-suite\` label. ` +
        'Re-enable one by removing its group from `TEMPORARILY_DISABLED_TEST_GROUPS` ' +
        'in `scripts/ci/pr-test-plan.mjs` and setting its `vars.ENABLE_*_CI` ' +
        'repository variable.',
    );
  }

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
