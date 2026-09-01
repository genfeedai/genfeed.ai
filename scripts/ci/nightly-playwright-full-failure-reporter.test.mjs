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
  assert.match(WORKFLOW, /github\.rest\.actions\.listJobsForWorkflowRun/u);
  assert.match(WORKFLOW, /collectScheduledRunFailures/u);
  assert.match(WORKFLOW, /trackerJob: 'e2e-frontend-full'/u);
});
