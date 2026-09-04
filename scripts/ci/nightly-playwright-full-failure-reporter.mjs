import {
  collectScheduledRunFailures,
  recordScheduledWorkflowGreen,
  reportScheduledFailure,
} from './scheduled-failure-tracker.mjs';

export { collectScheduledRunFailures };

export const NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL =
  'nightly-playwright-full-failure';
export const NIGHTLY_PLAYWRIGHT_FULL_FAILURE_TITLE =
  'Nightly Playwright full tier is failing';
export const NIGHTLY_PLAYWRIGHT_FULL_WORKFLOW_IDENTITY =
  '.github/workflows/playwright-full-nightly.yml';

export function buildPlaywrightFullExcerpt({ result, inventory }) {
  return [
    `Playwright test suite failed with result: ${result}.`,
    inventory || 'Inventory artifact was not available.',
  ].join('\n');
}

export async function reportNightlyPlaywrightFullFailure({
  github,
  owner,
  repo,
  failedJob = 'e2e-frontend-full',
  excerpt,
  identitySignature,
  sha,
  runId,
  runAttempt,
  runUrl,
  occurredAt,
  core = console,
}) {
  return reportScheduledFailure({
    github,
    owner,
    repo,
    trackerLabel: NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
    trackerDescription: 'Scheduled Playwright full-tier failures',
    workflowIdentity: NIGHTLY_PLAYWRIGHT_FULL_WORKFLOW_IDENTITY,
    failedJob,
    excerpt,
    identitySignature,
    sha,
    runId,
    runAttempt,
    runUrl,
    occurredAt,
    reproduction:
      'Dispatch the Nightly Playwright Full Tier workflow with the same full-tier manifest.',
    core,
  });
}

export async function resolveNightlyPlaywrightFullFailures({
  github,
  owner,
  repo,
  sha,
  runId,
  runUrl,
  occurredAt,
  core = console,
}) {
  return recordScheduledWorkflowGreen({
    github,
    owner,
    repo,
    workflowIdentity: NIGHTLY_PLAYWRIGHT_FULL_WORKFLOW_IDENTITY,
    sha,
    runId,
    runUrl,
    occurredAt,
    core,
  });
}
