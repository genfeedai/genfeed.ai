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
  assert.match(WORKFLOW, /github\.rest\.actions\.listJobsForWorkflowRun/u);
  assert.match(WORKFLOW, /collectScheduledRunFailures/u);
  assert.match(WORKFLOW, /trackerJob/u);
});
