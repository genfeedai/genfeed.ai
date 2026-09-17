/**
 * Master push Tests Gate tracker (#2510).
 *
 * A red `master` used to be visible only in the Actions tab: the heavy tier
 * and the Tests Gate were skipped on push events entirely, and once they ran
 * there was still nothing pointing at a failure. This reporter mirrors the
 * release E2E tracker contract:
 *
 * Failure path: one open tracker (comment on repeat reds), found by the
 * `master-ci-failure` label OR the title prefix
 * `🚨 Tests Gate failed on master push`. GitHub can silently drop create-time
 * labels, which orphaned 42 unlabeled duplicates and made label-only lookup
 * file a new issue every red push. Title-prefix fallback plus a separate
 * addLabels call keeps the canonical tracker (#3798) as the only open one.
 * Native issue Priority P0 via the shared board triage.
 * Success path: close every open Tests Gate tracker — labeled or unlabeled
 * title-prefix — with a green comment so a recovered trunk cannot keep a
 * stale P0 on the board. Auto-close is scoped to this workflow: a nightly
 * Playwright tracker that also carries `master-ci-failure` (#4579 / #4689)
 * must stay open until its own scheduled recovery path closes it.
 */

import { applyTrackerLabel } from './ci-tracker-labels.mjs';
import { COVERAGE_FAILURE_LABEL } from './coverage-failure-reporter.mjs';
import { triageCiFailureOnProject } from './genfeed-project-board.mjs';
import { NIGHTLY_E2E_FAILURE_LABEL } from './nightly-e2e-failure-reporter.mjs';
import { NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL } from './nightly-playwright-full-failure-reporter.mjs';
import { RELEASE_E2E_FAILURE_LABEL } from './release-e2e-failure-reporter.mjs';
import { SCHEDULED_FAILURE_MARKER } from './scheduled-failure-tracker.mjs';

export const MASTER_CI_FAILURE_LABEL = 'master-ci-failure';
export const MASTER_CI_FAILURE_TITLE_PREFIX =
  '🚨 Tests Gate failed on master push';

export const FOREIGN_MASTER_CI_TRACKER_LABELS = [
  COVERAGE_FAILURE_LABEL,
  NIGHTLY_E2E_FAILURE_LABEL,
  NIGHTLY_PLAYWRIGHT_FULL_FAILURE_LABEL,
  RELEASE_E2E_FAILURE_LABEL,
];

function issueLabelNames(issue) {
  return (issue.labels ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry?.name,
  );
}

function hasMasterCiFailureTitle(issue) {
  const title = typeof issue.title === 'string' ? issue.title : '';
  return title.startsWith(MASTER_CI_FAILURE_TITLE_PREFIX);
}

function issueBody(issue) {
  return typeof issue?.body === 'string' ? issue.body : '';
}

export function isForeignWorkflowTracker(issue) {
  const labels = issueLabelNames(issue);
  if (
    FOREIGN_MASTER_CI_TRACKER_LABELS.some((label) => labels.includes(label))
  ) {
    return true;
  }
  return issueBody(issue).includes(SCHEDULED_FAILURE_MARKER);
}

async function listLabeledTrackerIssues(github, { owner, repo, state }) {
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

async function listOpenIssues(github, { owner, repo, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
}

function mergeTrackerIssue(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  const labels = [
    ...new Set([...issueLabelNames(existing), ...issueLabelNames(incoming)]),
  ].map((name) => ({ name }));
  return {
    ...existing,
    ...incoming,
    labels,
    body: issueBody(incoming) || issueBody(existing) || incoming.body,
    title: incoming.title || existing.title,
  };
}

/**
 * Open Tests Gate trackers: labeled `master-ci-failure` and/or titled with
 * `🚨 Tests Gate failed on master push`. Sorted by issue number so resolve
 * and canonical-pick are deterministic. Trackers owned by another workflow
 * are excluded even when they also carry this label.
 *
 * @returns {Promise<Array<{ issue: object, isLabeled: boolean }>>}
 */
async function listTrackerIssues(github, { owner, repo, state }) {
  const [labeled, openIssues] = await Promise.all([
    listLabeledTrackerIssues(github, { owner, repo, state }),
    listOpenIssues(github, { owner, repo, state }),
  ]);

  const byNumber = new Map();

  for (const issue of openIssues) {
    if (
      issue.pull_request ||
      !hasMasterCiFailureTitle(issue) ||
      isForeignWorkflowTracker(issue)
    ) {
      continue;
    }
    byNumber.set(issue.number, {
      issue,
      isLabeled: issueLabelNames(issue).includes(MASTER_CI_FAILURE_LABEL),
    });
  }

  // Label lookup is authoritative even when the payload omits `labels` or the
  // title drifted. A labeled hit overwrites a title-only entry for the same
  // number so canonical pick prefers the labeled tracker.
  for (const issue of labeled) {
    if (issue.pull_request) {
      continue;
    }
    const existing = byNumber.get(issue.number);
    const merged = mergeTrackerIssue(existing?.issue, issue);
    if (isForeignWorkflowTracker(merged)) {
      byNumber.delete(issue.number);
      continue;
    }
    byNumber.set(issue.number, {
      issue: merged,
      isLabeled: true,
    });
  }

  return [...byNumber.values()].sort(
    (left, right) => left.issue.number - right.issue.number,
  );
}

function pickCanonicalTracker(trackers) {
  const labeled = trackers.filter((entry) => entry.isLabeled);
  const pool = labeled.length > 0 ? labeled : trackers;
  return pool[0];
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
    `Automation sets native issue **Priority = P0** (Priority is structured issue metadata, not a label).`,
    `This tracker closes automatically on the next green master push.`,
  ].join('\n');
}

async function commentAndTriageExistingTracker(
  github,
  { owner, repo, issueNumber, body, core, projectGithub },
) {
  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  await applyTrackerLabel(github, {
    owner,
    repo,
    issueNumber,
    label: MASTER_CI_FAILURE_LABEL,
  });
  // Re-assert P0 every red push so backlog drift cannot deprioritize it.
  await triageCiFailureOnProject(projectGithub, {
    owner,
    repo,
    issueNumber,
    trackerName: MASTER_CI_FAILURE_LABEL,
    core,
  });
  core.info?.(`Commented on existing master-ci-failure issue #${issueNumber}`);
  return { action: 'commented', issueNumber };
}

export async function reportMasterCiFailure({
  github,
  projectGithub = github,
  owner,
  repo,
  body,
  date,
  core = console,
}) {
  await ensureMasterCiFailureLabel(github, { owner, repo });

  const openTrackers = await listTrackerIssues(github, {
    owner,
    repo,
    state: 'open',
  });

  if (openTrackers.length > 0) {
    const { issue } = pickCanonicalTracker(openTrackers);
    return commentAndTriageExistingTracker(github, {
      owner,
      repo,
      issueNumber: issue.number,
      body,
      core,
      projectGithub,
    });
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: `${MASTER_CI_FAILURE_TITLE_PREFIX} — ${date}`,
    body,
    labels: [MASTER_CI_FAILURE_LABEL],
  });

  // Create-time labels are best-effort: GitHub silently drops them when the
  // token lacks push access. addLabels is the authoritative second write.
  await applyTrackerLabel(github, {
    owner,
    repo,
    issueNumber: created.data.number,
    label: MASTER_CI_FAILURE_LABEL,
  });

  await triageCiFailureOnProject(projectGithub, {
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
  const openTrackers = await listTrackerIssues(github, {
    owner,
    repo,
    state: 'open',
  });

  if (openTrackers.length === 0) {
    core.info?.('No open master-ci-failure trackers to close');
    return { action: 'noop', closed: [] };
  }

  const closed = [];
  for (const { issue } of openTrackers) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body,
    });
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'completed',
    });
    closed.push(issue.number);
    core.info?.(
      `Closed master-ci-failure issue #${issue.number} after green push`,
    );
  }

  return { action: 'closed', closed };
}
