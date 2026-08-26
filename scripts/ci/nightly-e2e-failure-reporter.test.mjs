import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NIGHTLY_E2E_FAILURE_LABEL,
  NIGHTLY_E2E_FAILURE_TITLE,
  NIGHTLY_E2E_WORKFLOW_IDENTITY,
} from './nightly-e2e-failure-reporter.mjs';
import { classifyScheduledFailure } from './scheduled-failure-tracker.mjs';

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
