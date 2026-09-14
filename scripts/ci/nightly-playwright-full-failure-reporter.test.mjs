import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { NIGHTLY_E2E_FAILURE_LABEL } from './nightly-e2e-failure-reporter.mjs';
import {
  buildPlaywrightFullExcerpt,
  NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
  NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE,
  NIGHTLY_PLAYWRIGHT_FULL_WORKFLOW_IDENTITY,
} from './nightly-playwright-full-failure-reporter.mjs';
import { classifyScheduledFailure } from './scheduled-failure-tracker.mjs';

const WORKFLOW = readFileSync(
  fileURLToPath(
    new URL(
      '../../.github/workflows/playwright-full-nightly.yml',
      import.meta.url,
    ),
  ),
  'utf8',
);

test('Playwright full-tier keeps a distinct scheduled tracker identity', () => {
  assert.equal(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    'nightly-playwright-full-failure',
  );
  assert.notEqual(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    NIGHTLY_E2E_FAILURE_LABEL,
  );
  assert.equal(
    NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE,
    'Nightly Playwright full tier is failing',
  );
  assert.equal(
    NIGHTLY_PLAYWRIGHT_FULL_WORKFLOW_IDENTITY,
    '.github/workflows/playwright-full-nightly.yml',
  );
});

test('full-tier adapter produces deterministic bounded assertion evidence', () => {
  const excerpt = buildPlaywrightFullExcerpt({
    result: 'failure',
    inventory: [
      '- Discovered: 120',
      '- Selected: 110',
      '- Executed: 108',
      '- Quarantined: 10',
      '- Failed: 2',
    ].join('\n'),
  });
  const classified = classifyScheduledFailure(excerpt);
  assert.equal(classified.failureClass, 'test-assertion');
  assert.match(classified.publicExcerpt, /Discovered: 120/u);
  assert.match(classified.signature, /discovered: <n>/u);
});

test('full-tier reporter separates failed scenarios from matrix job logs', () => {
  assert.match(WORKFLOW, /actions: read/u);
  assert.match(WORKFLOW, /contents: read/u);
  assert.match(WORKFLOW, /issues: write/u);
  assert.match(
    WORKFLOW,
    /repositoryGithub\.rest\.actions\.listJobsForWorkflowRun/u,
  );
  assert.match(WORKFLOW, /collectScheduledRunFailures/u);
  assert.match(WORKFLOW, /trackerJob: 'e2e-frontend-full'/u);
});

test('full-tier failure step separates repository and project credentials', () => {
  const report = WORKFLOW.split('  nightly-failure-report:')[1].split(
    '  nightly-recovery-report:',
  )[0];
  const step = report.split(
    '- name: Create or update the bounded Playwright full-tier tracker',
  )[1];
  assert.match(step, /REPOSITORY_TOKEN: \$\{\{ github.token \}\}/u);
  assert.match(step, /github-token: \$\{\{ secrets.CONSOLE_DEPLOY_TOKEN \}\}/u);
  assert.match(
    step,
    /const repositoryGithub = getOctokit\(process.env.REPOSITORY_TOKEN\)/u,
  );
  assert.match(
    step,
    /const jobs = await repositoryGithub.paginate\(\s*repositoryGithub.rest.actions.listJobsForWorkflowRun/u,
  );
  assert.match(
    step,
    /collectScheduledRunFailures\(\{\s*github: repositoryGithub,/u,
  );
  assert.match(
    step,
    /reportNightlyPlaywrightFullFailure\(\{\s*github: repositoryGithub,\s*projectGithub: github,/u,
  );
  assert.match(report, /github.event_name == 'schedule'/u);
  assert.match(
    report,
    /permissions:\s*actions: read\s*contents: read\s*issues: write/u,
  );
  assert.match(
    report,
    /group: nightly-playwright-full-failure-reporter\s*cancel-in-progress: false/u,
  );
  assert.match(report, /persist-credentials: false/u);
});

test('full-tier tracker failures stay visible while optional inventory remains tolerated', () => {
  const report = WORKFLOW.split('  nightly-failure-report:')[1].split(
    '  nightly-recovery-report:',
  )[0];
  const [before, step] = report.split(
    '- name: Create or update the bounded Playwright full-tier tracker',
  );
  assert.doesNotMatch(step, /continue-on-error:/u);
  assert.doesNotMatch(step, /catch\s*\(/u);
  assert.match(
    before,
    /name: Download full-tier summary[\s\S]*continue-on-error: true/u,
  );
  const recovery = WORKFLOW.split('  nightly-recovery-report:')[1];
  assert.match(recovery, /github-token: \$\{\{ github.token \}\}/u);
});
