import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NIGHTLY_E2E_FAILURE_LABEL,
  NIGHTLY_E2E_FAILURE_TITLE,
  NIGHTLY_E2E_WORKFLOW_IDENTITY,
} from './nightly-e2e-failure-reporter.mjs';
import { classifyScheduledFailure } from './scheduled-failure-tracker.mjs';

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/e2e.yml', import.meta.url)),
  'utf8',
);

test('nightly E2E adapter keeps its established label and stable workflow identity', () => {
  assert.equal(NIGHTLY_E2E_FAILURE_LABEL, 'nightly-e2e-failure');
  assert.equal(NIGHTLY_E2E_FAILURE_TITLE, 'Nightly E2E suite is failing');
  assert.equal(NIGHTLY_E2E_WORKFLOW_IDENTITY, '.github/workflows/e2e.yml');
});

test('nightly E2E adapter evidence maps failures and timeouts deterministically', () => {
  assert.equal(
    classifyScheduledFailure('Test suite failed: API E2E full tier.')
      .failureClass,
    'test-assertion',
  );
  assert.equal(
    classifyScheduledFailure('Timed out: API E2E full tier was cancelled.')
      .failureClass,
    'timeout',
  );
});

test('nightly E2E reporter derives actionable scenarios from failed source-job logs', () => {
  assert.match(WORKFLOW, /actions: read/u);
  assert.match(WORKFLOW, /contents: read/u);
  assert.match(WORKFLOW, /issues: write/u);
  assert.match(
    WORKFLOW,
    /repositoryGithub\.rest\.actions\.listJobsForWorkflowRun/u,
  );
  assert.match(WORKFLOW, /collectScheduledRunFailures/u);
  assert.match(WORKFLOW, /trackerJob/u);
});

test('nightly E2E failure step separates repository and project credentials', () => {
  const report = WORKFLOW.split('  nightly-failure-report:')[1].split(
    '  nightly-recovery-report:',
  )[0];
  const step = report.split(
    '- name: Create or update bounded nightly-failure trackers',
  )[1];
  assert.match(step, /REPOSITORY_TOKEN: \$\{\{ github.token \}\}/u);
  assert.match(step, /github-token: \$\{\{ secrets.CONSOLE_DEPLOY_TOKEN \}\}/u);
  assert.match(
    step,
    /const repositoryGithub = getOctokit\(process.env.REPOSITORY_TOKEN\)/u,
  );
  assert.match(
    step,
    /collectScheduledRunFailures\(\{\s*github: repositoryGithub,/u,
  );
  assert.match(
    step,
    /reportNightlyE2eFailure\(\{\s*github: repositoryGithub,\s*projectGithub: github,/u,
  );
  assert.match(report, /github.event_name == 'schedule'/u);
  assert.match(
    report,
    /permissions:\s*actions: read\s*contents: read\s*issues: write/u,
  );
  assert.match(
    report,
    /group: nightly-e2e-failure-reporter\s*cancel-in-progress: false/u,
  );
  assert.match(report, /persist-credentials: false/u);
});

test('nightly E2E tracker failures stay visible', () => {
  const report = WORKFLOW.split('  nightly-failure-report:')[1].split(
    '  nightly-recovery-report:',
  )[0];
  const step = report.split(
    '- name: Create or update bounded nightly-failure trackers',
  )[1];
  assert.doesNotMatch(step, /continue-on-error:/u);
  assert.doesNotMatch(step, /catch\s*\(/u);
});

for (const workflowName of ['e2e.yml', 'playwright-full-nightly.yml']) {
  test(`${workflowName} recovery uses the job issue permission and exposes write failures`, () => {
    const workflow = readFileSync(
      new URL(`../../.github/workflows/${workflowName}`, import.meta.url),
      'utf8',
    );
    const recovery = workflow
      .split('  nightly-recovery-report:')[1]
      ?.split(/\n {2}[a-z0-9-]+:\n/u)[0];
    assert.ok(recovery);
    assert.match(recovery, /issues: write/u);
    assert.match(recovery, /github-token: \$\{\{ github\.token \}\}/u);
    assert.doesNotMatch(
      recovery,
      /CONSOLE_DEPLOY_TOKEN|continue-on-error: true/u,
    );
  });
}
