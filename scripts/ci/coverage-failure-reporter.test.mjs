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
  assert.match(WORKFLOW, /github\.rest\.actions\.listJobsForWorkflowRun/);
  assert.match(WORKFLOW, /collectScheduledRunFailures/);
  assert.match(WORKFLOW, /reportCoverageFailures/);
  assert.match(WORKFLOW, /resolveCoverageFailures/);
  assert.match(WORKFLOW, /continue-on-error: true/);
  assert.match(
    WORKFLOW,
    /github-token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
  );
  assert.match(WORKFLOW, /group: scheduled-coverage-failure-reporter/);
});
