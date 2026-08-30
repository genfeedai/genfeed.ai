/**
 * Self-hosted release E2E tracker.
 *
 * Failure path: one open `release-e2e` issue, native Priority P0, Area Infra.
 * Success path: close every open `release-e2e` tracker with a green comment so the
 * board cannot look tidy while CI is red, and cannot stay red forever after green.
 *
 * Project field writes are best-effort. Issues still file when Projects GraphQL
 * is denied; the Actions log records the miss. Board ids and the triage
 * mutation live in `genfeed-project-board.mjs`, shared with the master push
 * CI failure reporter.
 */

import { applyTrackerLabel } from './ci-tracker-labels.mjs';
import { triageCiFailureOnProject } from './genfeed-project-board.mjs';

export const RELEASE_E2E_FAILURE_LABEL = 'release-e2e';

async function listTrackerIssues(github, { owner, repo, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: RELEASE_E2E_FAILURE_LABEL,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
}

export async function ensureReleaseE2eLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: RELEASE_E2E_FAILURE_LABEL,
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: RELEASE_E2E_FAILURE_LABEL,
      color: 'b60205',
      description: 'Self-hosted release E2E failures',
    });
  }
}

/**
 * Build the issue / comment body for a red release E2E run.
 * @param {{ date: string, releaseTag: string, imageTag: string, runUrl: string, failureClass?: string }} input
 */
export function buildReleaseE2eFailureBody({
  date,
  releaseTag,
  imageTag,
  runUrl,
  failureClass = 'unknown',
}) {
  return [
    `**Self-hosted release E2E failed** on \`${date}\`.`,
    ``,
    `- GitHub release: \`${releaseTag}\``,
    `- Image tag under test: \`ghcr.io/genfeedai/genfeed.ai:${imageTag}\``,
    `- Failure class: \`${failureClass}\``,
    `- Failed run: ${runUrl}`,
    `- Diagnostic artifacts (when produced): \`release-e2e-playwright-report\`, \`release-e2e-compose-logs\``,
    ``,
    `The public release bundle, anonymous image pull, boot path, or LOCAL-mode E2E failed.`,
    `Automation sets native issue **Priority = P0** (Priority is structured issue metadata, not a label).`,
  ].join('\n');
}

export async function reportReleaseE2eFailure({
  github,
  owner,
  repo,
  body,
  date,
  core = console,
}) {
  await ensureReleaseE2eLabel(github, { owner, repo });

  const openTrackers = (
    await listTrackerIssues(github, {
      owner,
      repo,
      state: 'open',
    })
  ).filter((issue) => !issue.pull_request);

  if (openTrackers.length > 0) {
    const number = openTrackers[0].number;
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });
    // Re-assert P0 every red run so backlog drift cannot deprioritize it.
    await triageCiFailureOnProject(github, {
      owner,
      repo,
      issueNumber: number,
      trackerName: RELEASE_E2E_FAILURE_LABEL,
      core,
    });
    core.info?.(`Commented on existing release-e2e issue #${number}`);
    return { action: 'commented', issueNumber: number };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: `🚦 Self-hosted release E2E failed — ${date}`,
    body,
  });

  await applyTrackerLabel(github, {
    owner,
    repo,
    issueNumber: created.data.number,
    label: RELEASE_E2E_FAILURE_LABEL,
  });

  await triageCiFailureOnProject(github, {
    owner,
    repo,
    issueNumber: created.data.number,
    trackerName: RELEASE_E2E_FAILURE_LABEL,
    core,
  });
  core.info?.(`Created release-e2e issue #${created.data.number}`);
  return { action: 'created', issueNumber: created.data.number };
}

export async function resolveReleaseE2eFailure({
  github,
  owner,
  repo,
  body,
  core = console,
}) {
  const openTrackers = (
    await listTrackerIssues(github, {
      owner,
      repo,
      state: 'open',
    })
  ).filter((issue) => !issue.pull_request);

  if (openTrackers.length === 0) {
    core.info?.('No open release-e2e trackers to close');
    return { action: 'noop', closed: [] };
  }

  const closed = [];
  for (const tracker of openTrackers) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: tracker.number,
      body,
    });
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: tracker.number,
      state: 'closed',
      state_reason: 'completed',
    });
    closed.push(tracker.number);
    core.info?.(`Closed release-e2e issue #${tracker.number} after green run`);
  }

  return { action: 'closed', closed };
}
