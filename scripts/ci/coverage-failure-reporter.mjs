import {
  collectScheduledRunFailures,
  recordScheduledWorkflowGreen,
  reportScheduledFailure,
} from './scheduled-failure-tracker.mjs';

export { collectScheduledRunFailures };

export const COVERAGE_FAILURE_LABEL = 'scheduled-coverage-failure';
export const COVERAGE_WORKFLOW_IDENTITY = '.github/workflows/coverage.yml';

export async function reportCoverageFailures({
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
        trackerLabel: COVERAGE_FAILURE_LABEL,
        trackerDescription: 'Scheduled coverage workflow failures',
        workflowIdentity: COVERAGE_WORKFLOW_IDENTITY,
        failedJob: failure.failedJob,
        excerpt: failure.excerpt,
        identitySignature: failure.identitySignature,
        sha,
        runId,
        runAttempt,
        runUrl,
        occurredAt,
        reproduction:
          'Dispatch the Coverage workflow and select the failing workspace job.',
        core,
      }),
    );
  }
  return results;
}

export async function resolveCoverageFailures({
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
    workflowIdentity: COVERAGE_WORKFLOW_IDENTITY,
    sha,
    runId,
    runUrl,
    occurredAt,
    core,
  });
}
