/**
 * Master push Tests Gate tracker (#2510).
 *
 * A red `master` used to be visible only in the Actions tab: the heavy tier
 * and the Tests Gate were skipped on push events entirely, and once they ran
 * there was still nothing pointing at a failure. This reporter mirrors the
 * release E2E tracker contract:
 *
 * Failure path: one open `master-ci-failure` issue (comment on repeat reds),
 * Project #12 Priority P0 via the shared board triage.
 * Success path: close every open tracker with a green comment so a recovered
 * trunk cannot keep a stale P0 on the board.
 */

import { triageCiFailureOnProject } from './genfeed-project-board.mjs';

export const MASTER_CI_FAILURE_LABEL = 'master-ci-failure';

async function listTrackerIssues(github, { owner, repo, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: MASTER_CI_FAILURE_LABEL,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
}

export async function ensureMasterCiFailureLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: MASTER_CI_FAILURE_LABEL,
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: MASTER_CI_FAILURE_LABEL,
      color: 'b60205',
      description: 'Tests Gate is failing on master push CI',
    });
  }
}

/**
 * Build the issue / comment body for a red master push.
 * @param {{ date: string, sha: string, headline: string, runUrl: string }} input
 */
export function buildMasterCiFailureBody({ date, sha, headline, runUrl }) {
  return [
    `**Tests Gate failed on a \`master\` push** on \`${date}\`.`,
    ``,
    `- Commit: \`${sha}\` — ${headline}`,
    `- Failed run: ${runUrl}`,
    `- The run's Tests Gate step summary names the exact job(s) that went red.`,
    ``,
    `The trunk is red: every branch cut from \`master\` inherits this failure.`,
    `Automation sets Project **Priority = P0** (Priority is a project field, not a label).`,
    `This tracker closes automatically on the next green master push.`,
  ].join('\n');
}

export async function reportMasterCiFailure({
  github,
  owner,
  repo,
  body,
  date,
  core = console,
}) {
  await ensureMasterCiFailureLabel(github, { owner, repo });

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
    // Re-assert P0 every red push so backlog drift cannot deprioritize it.
    await triageCiFailureOnProject(github, {
      owner,
      repo,
      issueNumber: number,
      trackerName: MASTER_CI_FAILURE_LABEL,
      core,
    });
    core.info?.(`Commented on existing master-ci-failure issue #${number}`);
    return { action: 'commented', issueNumber: number };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: `🚨 Tests Gate failed on master push — ${date}`,
    body,
    labels: [MASTER_CI_FAILURE_LABEL],
  });

  await triageCiFailureOnProject(github, {
    owner,
    repo,
    issueNumber: created.data.number,
    trackerName: MASTER_CI_FAILURE_LABEL,
    core,
  });
  core.info?.(`Created master-ci-failure issue #${created.data.number}`);
  return { action: 'created', issueNumber: created.data.number };
}

export async function resolveMasterCiFailure({
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
    core.info?.('No open master-ci-failure trackers to close');
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
    core.info?.(
      `Closed master-ci-failure issue #${tracker.number} after green push`,
    );
  }

  return { action: 'closed', closed };
}
