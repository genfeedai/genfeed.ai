import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COVERAGE_FAILURE_LABEL,
  COVERAGE_WORKFLOW_IDENTITY,
} from './coverage-failure-reporter.mjs';

const WORKFLOW = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/coverage.yml', import.meta.url),
  ),
  'utf8',
);

test('coverage has a dedicated scheduled tracker identity', () => {
  assert.equal(COVERAGE_FAILURE_LABEL, 'scheduled-coverage-failure');
  assert.equal(COVERAGE_WORKFLOW_IDENTITY, '.github/workflows/coverage.yml');
});

test('coverage reports failed jobs and records green recovery without masking source results', () => {
  assert.match(WORKFLOW, /^ {2}scheduled-failure-report:/m);
  assert.match(
    WORKFLOW,
    /repositoryGithub\.rest\.actions\.listJobsForWorkflowRun/,
  );
  assert.match(WORKFLOW, /collectScheduledRunFailures/);
  assert.match(WORKFLOW, /reportCoverageFailures/);
  assert.match(WORKFLOW, /resolveCoverageFailures/);
  assert.match(WORKFLOW, /group: scheduled-coverage-failure-reporter/);
});

test('coverage reporter step separates repository and project credentials', () => {
  const report = WORKFLOW.split('  scheduled-failure-report:')[1];
  const step = report.split(
    '- name: Create, update, or recover bounded coverage trackers',
  )[1];
  assert.match(step, /REPOSITORY_TOKEN: \$\{\{ github.token \}\}/u);
  assert.match(
    step,
    /github-token: \$\{\{ steps\.reporter-token\.outputs\.token \}\}/u,
  );
  assert.match(
    report,
    /- name: Mint reporter token \(Genfeed bot App\)\n\s+id: reporter-token\n\s+uses: \.\/\.github\/actions\/reporter-token\n\s+with:\n\s+client-id: \$\{\{ secrets\.GENFEED_BOT_CLIENT_ID \}\}\n\s+private-key: \$\{\{ secrets\.GENFEED_BOT_PRIVATE_KEY \}\}\n/u,
    'reporter token must be minted from the Genfeed bot App',
  );
  assert.ok(
    report.indexOf('actions/checkout@') <
      report.indexOf('uses: ./.github/actions/reporter-token'),
    'the composite action is local, so the repository must be checked out first',
  );
  assert.doesNotMatch(report, /CONSOLE_DEPLOY_TOKEN/u);
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
    /resolveCoverageFailures\(\{\s*github: repositoryGithub,/u,
  );
  assert.match(
    step,
    /reportCoverageFailures\(\{\s*github: repositoryGithub,\s*projectGithub: github,/u,
  );
  assert.match(report, /actions: read/u);
  assert.match(report, /contents: read/u);
  assert.match(report, /issues: write/u);
  assert.match(report, /persist-credentials: false/u);
});

test('coverage tracker failures stay visible', () => {
  const report = WORKFLOW.split('  scheduled-failure-report:')[1];
  const step = report.split(
    '- name: Create, update, or recover bounded coverage trackers',
  )[1];
  assert.doesNotMatch(step, /continue-on-error:/u);
  assert.doesNotMatch(step, /catch\s*\(/u);
});
