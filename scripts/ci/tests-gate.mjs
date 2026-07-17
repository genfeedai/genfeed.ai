#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const VALID_RESULTS = new Set(['success', 'failure', 'cancelled', 'skipped']);

const ALWAYS_APPLICABLE_JOBS = [
  ['Package tests', 'TEST_PACKAGES_RESULT'],
  ['Server-service tests', 'TEST_SERVER_SERVICES_RESULT'],
  ['Web, desktop, and mobile tests', 'TEST_WEB_DESKTOP_MOBILE_RESULT'],
  ['Extension tests', 'TEST_EXTENSIONS_RESULT'],
  ['Build', 'BUILD_RESULT'],
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
  const appScope = parseBoolean(env.TEST_SCOPE_APP, 'TEST_SCOPE_APP', allowEmptyScope);
  const apiScope = parseBoolean(env.TEST_SCOPE_API, 'TEST_SCOPE_API', allowEmptyScope);
  const fullSuite = parseBoolean(env.FULL_SUITE, 'FULL_SUITE');

  return [
    {
      name: 'Test scope',
      result: testScopeResult,
      applicable: true,
    },
    ...ALWAYS_APPLICABLE_JOBS.map(([name, key]) => ({
      name,
      result: readResult(env, key),
      applicable: true,
    })),
    {
      name: 'App tests (full matrix)',
      result: readResult(env, 'TEST_APP_RESULT'),
      applicable: appScope && fullSuite,
    },
    {
      name: 'App tests (changed)',
      result: readResult(env, 'TEST_APP_CHANGED_RESULT'),
      applicable: appScope && !fullSuite,
    },
    {
      name: 'API tests (full matrix)',
      result: readResult(env, 'TEST_API_RESULT'),
      applicable: apiScope && fullSuite,
    },
    {
      name: 'API tests (changed)',
      result: readResult(env, 'TEST_API_CHANGED_RESULT'),
      applicable: apiScope && !fullSuite,
    },
    {
      name: 'OpenAPI spec drift',
      result: readResult(env, 'OPENAPI_DRIFT_RESULT'),
      applicable: apiScope,
    },
  ];
}

export function evaluateTestsGate(jobs) {
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

    rows.push({
      ...job,
      classification: result === 'skipped' ? 'not applicable' : 'passed',
    });
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

  lines.push(
    '',
    evaluation.passed
      ? 'All applicable test and build jobs passed.'
      : `Gate failures: ${evaluation.failures.join('; ')}.`,
  );

  return `${lines.join('\n')}\n`;
}

function runCli() {
  let evaluation;

  try {
    evaluation = evaluateTestsGate(createTestsGateJobs(process.env));
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
