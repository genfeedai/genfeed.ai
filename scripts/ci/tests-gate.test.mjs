import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTestsGateJobs, evaluateTestsGate } from './tests-gate.mjs';

const ALL_SUCCESS_ENV = {
  TEST_SCOPE_APP: 'true',
  TEST_SCOPE_API: 'true',
  FULL_SUITE: 'false',
  TEST_SCOPE_RESULT: 'success',
  TEST_PACKAGES_RESULT: 'success',
  TEST_SERVER_SERVICES_RESULT: 'success',
  TEST_WEB_DESKTOP_MOBILE_RESULT: 'success',
  TEST_EXTENSIONS_RESULT: 'success',
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
  const gatePath = fileURLToPath(
    new URL('./tests-gate.mjs', import.meta.url),
  );

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
  assert.match(
    workflow,
    /^ {4}if: \$\{\{ always\(\) && github\.event_name == 'pull_request' \}\}\n/m,
  );

  for (const job of [
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
