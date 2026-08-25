import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTestsGateJobs, evaluateTestsGate } from './tests-gate.mjs';

const ALL_SUCCESS_ENV = {
  TEST_SCOPE_APP: 'true',
  TEST_SCOPE_API: 'true',
  TEST_SCOPE_APP_TESTS: 'true',
  TEST_SCOPE_API_TESTS: 'true',
  TEST_SCOPE_PACKAGES: 'true',
  TEST_SCOPE_SERVER_SERVICES: 'true',
  TEST_SCOPE_WEB_DESKTOP_MOBILE: 'true',
  TEST_SCOPE_EXTENSIONS: 'true',
  FULL_SUITE: 'false',
  TEST_SCOPE_RESULT: 'success',
  TEST_PACKAGES_RESULT: 'success',
  TEST_SERVER_SERVICES_RESULT: 'success',
  TEST_WEB_DESKTOP_MOBILE_RESULT: 'success',
  TEST_EXTENSIONS_RESULT: 'success',
  STATIC_CHECKS_RESULT: 'success',
  BUILD_RESULT: 'success',
  TEST_APP_RESULT: 'skipped',
  TEST_APP_CHANGED_RESULT: 'success',
  TEST_API_RESULT: 'skipped',
  TEST_API_CHANGED_RESULT: 'success',
  OPENAPI_DRIFT_RESULT: 'success',
};

function evaluate(env = {}) {
  return evaluateTestsGate(createTestsGateJobs({ ...ALL_SUCCESS_ENV, ...env }));
}

function runGateCli(env = {}) {
  const gatePath = fileURLToPath(new URL('./tests-gate.mjs', import.meta.url));

  return spawnSync(process.execPath, [gatePath], {
    env: { ...process.env, ...ALL_SUCCESS_ENV, ...env },
    encoding: 'utf8',
  });
}

test('passes when applicable jobs succeed and intentional skips are explicit', () => {
  const result = evaluate();

  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
  assert.equal(
    result.rows.find((row) => row.name === 'App tests (full matrix)')
      ?.classification,
    'not applicable',
  );
});

test('fails when an applicable upstream job fails', () => {
  const result = evaluate({ TEST_PACKAGES_RESULT: 'failure' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Package tests failure']);
});

test('accepts skipped workspace jobs only when the plan marks them inapplicable', () => {
  const result = evaluate({
    TEST_SCOPE_EXTENSIONS: 'false',
    TEST_EXTENSIONS_RESULT: 'skipped',
    TEST_SCOPE_SERVER_SERVICES: 'false',
    TEST_SERVER_SERVICES_RESULT: 'skipped',
  });

  assert.equal(result.passed, true);
  assert.equal(
    result.rows.find((row) => row.name === 'Server-service tests')
      ?.classification,
    'not applicable',
  );
});

test('labels a paused surface as dormant rather than merely out of scope', () => {
  const result = evaluate({
    TEST_SCOPE_EXTENSIONS: 'false',
    TEST_EXTENSIONS_RESULT: 'skipped',
  });

  assert.equal(result.passed, true);
  assert.equal(
    result.rows.find((row) => row.name === 'Extension tests')?.classification,
    'dormant (paused surface)',
  );
});

test('keeps a paused surface dormant on a full-suite run', () => {
  const result = evaluate({
    FULL_SUITE: 'true',
    TEST_SCOPE_EXTENSIONS: 'false',
    TEST_EXTENSIONS_RESULT: 'skipped',
    TEST_APP_RESULT: 'success',
    TEST_APP_CHANGED_RESULT: 'skipped',
    TEST_API_RESULT: 'success',
    TEST_API_CHANGED_RESULT: 'skipped',
  });

  assert.equal(result.passed, true);
  assert.equal(
    result.rows.find((row) => row.name === 'Extension tests')?.classification,
    'dormant (paused surface)',
  );
});

test('dormancy never softens a failing paused-surface job', () => {
  const result = evaluate({
    TEST_SCOPE_EXTENSIONS: 'false',
    TEST_EXTENSIONS_RESULT: 'failure',
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Extension tests failure']);
});

test('dormancy never excuses a paused surface the plan marked applicable', () => {
  const result = evaluate({
    TEST_SCOPE_EXTENSIONS: 'true',
    TEST_EXTENSIONS_RESULT: 'skipped',
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'Extension tests was applicable but skipped',
  ]);
});

test('names paused surfaces in the summary of an otherwise passing run', () => {
  const result = runGateCli({
    TEST_SCOPE_EXTENSIONS: 'false',
    TEST_EXTENSIONS_RESULT: 'skipped',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /All applicable test and build jobs passed\./);
  assert.match(
    result.stdout,
    /Not covered by this run — paused surfaces: Extension tests\./,
  );
  assert.match(result.stdout, /stay skipped even with the `full-suite` label/);
});

test('omits the paused-surface note when nothing was skipped as dormant', () => {
  const result = runGateCli();

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /paused surfaces/);
});

test('rejects skipped workspace jobs when the plan marks them applicable', () => {
  const result = evaluate({ TEST_PACKAGES_RESULT: 'skipped' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'Package tests was applicable but skipped',
  ]);
});

test('fails closed when an applicable upstream result is missing', () => {
  assert.throws(
    () =>
      createTestsGateJobs({
        ...ALL_SUCCESS_ENV,
        TEST_PACKAGES_RESULT: undefined,
      }),
    /TEST_PACKAGES_RESULT must be a GitHub job result/,
  );
});

test('exits non-zero when an applicable upstream job fails', () => {
  const result = runGateCli({ TEST_PACKAGES_RESULT: 'failure' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Gate failures: Package tests failure\./);
});

test('fails when an upstream job is cancelled', () => {
  const result = evaluate({ BUILD_RESULT: 'cancelled' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Build cancelled']);
});

test('fails when the consolidated static checks fail', () => {
  // Format, secretlint, lint, typecheck, and the executable contracts run in
  // one static-checks job (#1969). The gate must treat that job exactly like
  // the five contexts it replaced.
  const result = evaluate({ STATIC_CHECKS_RESULT: 'failure' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Static checks failure']);
});

test('static checks can never be skipped past the gate', () => {
  const result = evaluate({ STATIC_CHECKS_RESULT: 'skipped' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'Static checks was applicable but skipped',
  ]);
});

test('fails when an applicable job is unexpectedly skipped', () => {
  const result = evaluate({ TEST_APP_CHANGED_RESULT: 'skipped' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'App tests (changed) was applicable but skipped',
  ]);
});

test('reports a scope failure when its outputs are empty', () => {
  const result = evaluate({
    TEST_SCOPE_APP: '',
    TEST_SCOPE_API: '',
    TEST_SCOPE_APP_TESTS: '',
    TEST_SCOPE_API_TESTS: '',
    TEST_SCOPE_PACKAGES: '',
    TEST_SCOPE_SERVER_SERVICES: '',
    TEST_SCOPE_WEB_DESKTOP_MOBILE: '',
    TEST_SCOPE_EXTENSIONS: '',
    TEST_SCOPE_RESULT: 'failure',
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Test scope failure']);
});

test('fails closed when a successful scope job omits its outputs', () => {
  const result = runGateCli({
    TEST_SCOPE_APP: '',
    TEST_SCOPE_API: '',
    TEST_SCOPE_RESULT: 'success',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /TEST_SCOPE_APP must be "true" or "false"/);
});

test('accepts an empty affected-test manifest without requiring a runner', () => {
  const result = evaluate({
    TEST_SCOPE_APP_TESTS: 'false',
    TEST_APP_CHANGED_RESULT: 'skipped',
    TEST_SCOPE_API_TESTS: 'false',
    TEST_API_CHANGED_RESULT: 'skipped',
  });

  assert.equal(result.passed, true);
});

test('switches full-suite applicability without accepting missing matrix jobs', () => {
  const result = evaluate({
    FULL_SUITE: 'true',
    TEST_APP_RESULT: 'skipped',
    TEST_APP_CHANGED_RESULT: 'skipped',
    TEST_API_RESULT: 'success',
    TEST_API_CHANGED_RESULT: 'skipped',
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'App tests (full matrix) was applicable but skipped',
  ]);
});

test('keeps the workflow contract stable', () => {
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
  );
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^ {2}tests-gate:\n/m);
  assert.match(workflow, /^ {4}name: Tests Gate\n/m);
  // Pull requests, merge-queue runs (#3143) AND master pushes reach a
  // conclusive gate (#2510); the release path (workflow_call inherits the
  // caller's originating event) does not match any arm and stays unchanged.
  assert.match(
    workflow,
    /^ {4}if: \$\{\{ always\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \|\| github\.event_name == 'push'\) \}\}\n/m,
  );

  for (const job of [
    'static-checks',
    'test-scope',
    'test-packages',
    'test-server-services',
    'test-web-desktop-mobile',
    'test-extensions',
    'test-app',
    'test-app-changed',
    'test-api',
    'test-api-changed',
    'openapi-drift',
    'build',
  ]) {
    assert.match(workflow, new RegExp(`^      - ${job}$`, 'm'));
  }

  assert.match(
    workflow,
    /^ {8}shell: bash\n {8}run: node scripts\/ci\/tests-gate\.mjs \| tee -a "\$GITHUB_STEP_SUMMARY"$/m,
  );
});
