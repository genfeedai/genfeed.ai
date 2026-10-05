import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createPrTestPlan } from './pr-test-plan.mjs';

import {
  createTestsGateJobs,
  evaluateTestsGate,
  readSupersession,
} from './tests-gate.mjs';

const ALL_SUCCESS_ENV = {
  PLAN_RESULT: 'success',
  PLAN_APP_TESTS: 'true',
  PLAN_API_TESTS: 'true',
  PLAN_WORKSPACE_TESTS: 'true',
  PLAN_SPEC_TYPECHECK: 'true',
  STATIC_CHECKS_RESULT: 'success',
  SPEC_TYPECHECK_RESULT: 'success',
  TEST_WORKSPACES_RESULT: 'success',
  TEST_APP_RESULT: 'success',
  TEST_API_RESULT: 'success',
  CLOUD_TENANT_GUARD_RESULT: 'success',
  BUILD_RESULT: 'success',
};

function evaluate(env = {}) {
  const merged = { ...ALL_SUCCESS_ENV, ...env };
  return evaluateTestsGate(
    createTestsGateJobs(merged),
    readSupersession(merged),
  );
}

// What a pull request run looks like after a newer push cancelled it: the
// plan job never published outputs and every downstream job was cancelled.
const CANCELLED_RUN_ENV = {
  PLAN_RESULT: 'cancelled',
  PLAN_APP_TESTS: '',
  PLAN_API_TESTS: '',
  PLAN_WORKSPACE_TESTS: '',
  PLAN_SPEC_TYPECHECK: '',
  STATIC_CHECKS_RESULT: 'cancelled',
  SPEC_TYPECHECK_RESULT: 'cancelled',
  TEST_WORKSPACES_RESULT: 'cancelled',
  TEST_APP_RESULT: 'cancelled',
  TEST_API_RESULT: 'cancelled',
  CLOUD_TENANT_GUARD_RESULT: 'cancelled',
  BUILD_RESULT: 'cancelled',
};

function runGateCli(env = {}) {
  const gatePath = fileURLToPath(new URL('./tests-gate.mjs', import.meta.url));

  return spawnSync(process.execPath, [gatePath], {
    env: { ...process.env, ...ALL_SUCCESS_ENV, ...env },
    encoding: 'utf8',
  });
}

function classificationOf(result, name) {
  return result.rows.find((row) => row.name === name)?.classification;
}

test('passes when applicable jobs succeed', () => {
  const result = evaluate();

  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});

test('fails when an applicable upstream job fails', () => {
  const result = evaluate({ TEST_WORKSPACES_RESULT: 'failure' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Workspace tests failure']);
});

test('accepts skipped jobs only when the plan marks them inapplicable', () => {
  const result = evaluate({
    PLAN_WORKSPACE_TESTS: 'false',
    TEST_WORKSPACES_RESULT: 'skipped',
    PLAN_APP_TESTS: 'false',
    TEST_APP_RESULT: 'skipped',
    PLAN_API_TESTS: 'false',
    TEST_API_RESULT: 'skipped',
    CLOUD_TENANT_GUARD_RESULT: 'skipped',
    PLAN_SPEC_TYPECHECK: 'false',
    SPEC_TYPECHECK_RESULT: 'skipped',
  });

  assert.equal(result.passed, true);
  for (const name of [
    'Workspace tests',
    'App tests',
    'API tests',
    'Cloud Tenant Guard Sweep',
    'Spec typecheck',
  ]) {
    assert.equal(classificationOf(result, name), 'not applicable');
  }
});

test('rejects a skipped job the plan marked applicable', () => {
  for (const [key, name] of [
    ['TEST_WORKSPACES_RESULT', 'Workspace tests'],
    ['TEST_APP_RESULT', 'App tests'],
    ['TEST_API_RESULT', 'API tests'],
    ['CLOUD_TENANT_GUARD_RESULT', 'Cloud Tenant Guard Sweep'],
    ['SPEC_TYPECHECK_RESULT', 'Spec typecheck'],
  ]) {
    const result = evaluate({ [key]: 'skipped' });

    assert.equal(result.passed, false);
    assert.deepEqual(result.failures, [`${name} was applicable but skipped`]);
  }
});

test('labels a paused surface as dormant rather than merely out of scope', () => {
  const result = evaluate();

  assert.equal(result.passed, true);
  assert.equal(
    classificationOf(result, 'IDE extension tests'),
    'dormant (paused surface)',
  );
});

test('names paused surfaces in the summary of an otherwise passing run', () => {
  const result = runGateCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /All applicable test and build jobs passed\./);
  assert.match(
    result.stdout,
    /Not covered by this run — paused surfaces: IDE extension tests\./,
  );
  assert.match(result.stdout, /stay skipped even with the `full-suite` label/);
});

test('fails closed when an upstream result is missing', () => {
  assert.throws(
    () =>
      createTestsGateJobs({
        ...ALL_SUCCESS_ENV,
        TEST_WORKSPACES_RESULT: undefined,
      }),
    /TEST_WORKSPACES_RESULT must be a GitHub job result/,
  );
});

test('exits non-zero when an applicable upstream job fails', () => {
  const result = runGateCli({ TEST_API_RESULT: 'failure' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Gate failures: API tests failure\./);
});

test('fails when an upstream job is cancelled', () => {
  const result = evaluate({ BUILD_RESULT: 'cancelled' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Build cancelled']);
});

test('a cancelled run that was not superseded still fails instead of crashing', () => {
  const result = evaluate({ ...CANCELLED_RUN_ENV, RUN_SUPERSEDED: 'false' });

  assert.equal(result.passed, false);
  assert.equal(result.superseded, undefined);
  assert.ok(result.failures.includes('Plan cancelled'));
});

test('passes a pull request run superseded by a newer push', () => {
  const result = evaluate({
    ...CANCELLED_RUN_ENV,
    RUN_SUPERSEDED: 'true',
    SUPERSEDED_BY: '0ffd495866a8649fa37884b2c7ede62a709e0de9',
  });

  assert.equal(result.passed, true);
  assert.equal(result.superseded, true);
  assert.deepEqual(result.failures, []);
});

test('tolerates jobs left unrun by an upstream cancellation when superseded', () => {
  const result = evaluate({
    BUILD_RESULT: 'cancelled',
    TEST_APP_RESULT: 'skipped',
    RUN_SUPERSEDED: 'true',
  });

  assert.equal(result.passed, true);
  assert.equal(result.superseded, true);
});

test('a genuine failure keeps a superseded run red', () => {
  const result = evaluate({
    ...CANCELLED_RUN_ENV,
    PLAN_RESULT: 'success',
    PLAN_APP_TESTS: 'true',
    PLAN_API_TESTS: 'true',
    PLAN_WORKSPACE_TESTS: 'true',
    PLAN_SPEC_TYPECHECK: 'true',
    STATIC_CHECKS_RESULT: 'failure',
    RUN_SUPERSEDED: 'true',
  });

  assert.equal(result.passed, false);
  assert.ok(result.failures.includes('Static checks failure'));
});

test('master runs never read as superseded', () => {
  assert.deepEqual(readSupersession({}), {
    superseded: false,
    supersededBy: null,
  });
  assert.deepEqual(readSupersession({ RUN_SUPERSEDED: '' }), {
    superseded: false,
    supersededBy: null,
  });
});

test('exits zero and names the newer commit for a superseded run', () => {
  const result = runGateCli({
    ...CANCELLED_RUN_ENV,
    RUN_SUPERSEDED: 'true',
    SUPERSEDED_BY: '0ffd495866a8649fa37884b2c7ede62a709e0de9',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Superseded by commit 0ffd495866a8/);
});

test('static checks and build can never be skipped past the gate', () => {
  for (const [key, name] of [
    ['STATIC_CHECKS_RESULT', 'Static checks'],
    ['BUILD_RESULT', 'Build'],
  ]) {
    const result = evaluate({ [key]: 'skipped' });

    assert.equal(result.passed, false);
    assert.deepEqual(result.failures, [`${name} was applicable but skipped`]);
  }
});

test('fails when the spec typecheck ratchet fails', () => {
  // Spec files sit outside every workspace typecheck config, so the ratchet is
  // the only job that sees them. Left out of the gate it reported green on a
  // red trunk: run 32971423541 had Spec Typecheck failing, Tests Gate passing,
  // and the master failure tracker closing the open trackers.
  const result = evaluate({ SPEC_TYPECHECK_RESULT: 'failure' });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Spec typecheck failure']);
});

test('CLOUD sweep failure and cancellation block the aggregate gate', () => {
  for (const result of ['failure', 'cancelled']) {
    const evaluation = evaluate({ CLOUD_TENANT_GUARD_RESULT: result });
    assert.equal(evaluation.passed, false);
    assert.deepEqual(evaluation.failures, [
      `Cloud Tenant Guard Sweep ${result}`,
    ]);
  }
  assert.throws(
    () =>
      createTestsGateJobs({
        ...ALL_SUCCESS_ENV,
        CLOUD_TENANT_GUARD_RESULT: undefined,
      }),
    /CLOUD_TENANT_GUARD_RESULT/,
  );
});

test('a plan that never finished fails the gate on its own row', () => {
  const result = evaluate({
    PLAN_RESULT: 'failure',
    PLAN_APP_TESTS: '',
    PLAN_API_TESTS: '',
    PLAN_WORKSPACE_TESTS: '',
    PLAN_SPEC_TYPECHECK: '',
    SPEC_TYPECHECK_RESULT: 'skipped',
    TEST_WORKSPACES_RESULT: 'skipped',
    TEST_APP_RESULT: 'skipped',
    TEST_API_RESULT: 'skipped',
    CLOUD_TENANT_GUARD_RESULT: 'skipped',
    STATIC_CHECKS_RESULT: 'skipped',
    BUILD_RESULT: 'skipped',
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'Plan failure',
    'Static checks was applicable but skipped',
    'Build was applicable but skipped',
  ]);
});

test('fails closed when a successful plan omits its outputs', () => {
  const result = runGateCli({ PLAN_APP_TESTS: '' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PLAN_APP_TESTS must be "true" or "false"/);
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
    /^ {10}CLOUD_TENANT_GUARD_RESULT: \$\{\{ needs\.cloud-tenant-guard\.result \}\}$/m,
  );
  // Ready pull requests and merge groups reach a conclusive gate. The `push`
  // arm is dormant (the Full Suite no longer runs on master pushes); drafts and
  // the Full Suite dispatch/release path (workflow_dispatch) do not.
  assert.match(
    workflow,
    /^ {4}if: >-\n {6}\$\{\{ always\(\)\n {6}&& !github\.event\.pull_request\.draft\n {6}&& \(github\.event_name == 'pull_request' \|\| github\.event_name == 'merge_group' \|\| github\.event_name == 'push'\) \}\}\n/m,
  );

  for (const job of [
    'plan',
    'static-checks',
    'spec-typecheck',
    'test-workspaces',
    'test-app',
    'test-api',
    'cloud-tenant-guard',
    'build',
  ]) {
    assert.match(workflow, new RegExp(`^ {6}- ${job}$`, 'm'));
  }

  for (const [environmentKey, output] of [
    ['PLAN_APP_TESTS', 'app_tests'],
    ['PLAN_API_TESTS', 'api_tests'],
    ['PLAN_WORKSPACE_TESTS', 'workspace_tests'],
    ['PLAN_SPEC_TYPECHECK', 'spec_run'],
  ]) {
    assert.match(
      workflow,
      new RegExp(
        `^ {10}${environmentKey}: \\$\\{\\{ needs\\.plan\\.outputs\\.${output} \\}\\}$`,
        'm',
      ),
      `${environmentKey} must reach tests-gate from the plan`,
    );
  }

  // Supersession is detected for pull requests only and fed to the gate.
  assert.match(
    workflow,
    /^ {6}- name: Detect a pull request run superseded by a newer push\n {8}id: supersession\n {8}if: \$\{\{ github\.event_name == 'pull_request' \}\}\n/m,
  );
  assert.match(
    workflow,
    /^ {10}RUN_SUPERSEDED: \$\{\{ steps\.supersession\.outputs\.superseded \}\}\n {10}SUPERSEDED_BY: \$\{\{ steps\.supersession\.outputs\.superseded_by \}\}$/m,
  );

  assert.match(
    workflow,
    /^ {8}shell: bash\n {8}run: node scripts\/ci\/tests-gate\.mjs \| tee -a "\$GITHUB_STEP_SUMMARY"$/m,
  );
});

test('browser-planned workspace failures, cancellations and skips fail the aggregate gate', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['apps/extensions/browser/app/package.json'],
  });
  assert.deepEqual(
    plan.workspaceMatrix.include.map(({ group }) => group),
    ['browser-extension'],
  );
  for (const result of ['failure', 'cancelled', 'skipped']) {
    const evaluation = evaluate({
      PLAN_WORKSPACE_TESTS: String(plan.workspaceMatrix.include.length > 0),
      TEST_WORKSPACES_RESULT: result,
    });
    assert.equal(evaluation.passed, false, result);
    assert.equal(evaluation.failures.length, 1, result);
  }
});

test('unrelated inapplicable workspace skips remain distinct from IDE dormancy', () => {
  const plan = createPrTestPlan({
    base: 'base-sha',
    changedFiles: ['docs/testing.md'],
  });
  const result = evaluate({
    PLAN_WORKSPACE_TESTS: String(plan.workspaceMatrix.include.length > 0),
    TEST_WORKSPACES_RESULT: 'skipped',
  });
  assert.equal(result.passed, true);
  assert.equal(classificationOf(result, 'Workspace tests'), 'not applicable');
  assert.deepEqual(
    result.rows.filter(({ dormant }) => dormant).map(({ name }) => name),
    ['IDE extension tests'],
  );
  assert.equal(classificationOf(result, 'Extension tests'), undefined);
});
