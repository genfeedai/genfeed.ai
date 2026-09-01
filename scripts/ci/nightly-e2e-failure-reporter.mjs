import {
  collectScheduledRunFailures,
  recordScheduledWorkflowGreen,
  reportScheduledFailure,
} from './scheduled-failure-tracker.mjs';

export { collectScheduledRunFailures };

export const NIGHTLY_E2E_FAILURE_LABEL = 'nightly-e2e-failure';
export const NIGHTLY_E2E_FAILURE_TITLE = 'Nightly E2E suite is failing';
export const NIGHTLY_E2E_WORKFLOW_IDENTITY = '.github/workflows/e2e.yml';

export async function reportNightlyE2eFailure({
  github,
  owner,
  repo,
  failures,
  sha,
  runId,
  runAttempt,
  runUrl,
  occurredAt,
  core = console,
}) {
  const results = [];
  for (const failure of failures) {
    results.push(
      await reportScheduledFailure({
        github,
        owner,
        repo,
        trackerLabel: NIGHTLY_E2E_FAILURE_LABEL,
        trackerDescription: 'Scheduled nightly E2E failures',
        workflowIdentity: NIGHTLY_E2E_WORKFLOW_IDENTITY,
        failedJob: failure.failedJob,
        excerpt: failure.excerpt,
        sha,
        runId,
        runAttempt,
        runUrl,
        occurredAt,
        reproduction:
          'Dispatch the E2E Tests workflow with the same nightly inputs.',
        core,
      }),
    );
  }
  return results;
}

export async function resolveNightlyE2eFailures({
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
    workflowIdentity: NIGHTLY_E2E_WORKFLOW_IDENTITY,
    sha,
    runId,
    runUrl,
    occurredAt,
    core,
  });
}
