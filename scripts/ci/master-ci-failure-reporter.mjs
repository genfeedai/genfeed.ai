/**
 * Full Suite aggregate tracker for the current default-branch SHA (#5884).
 *
 * Failure path: one open tracker (comment on repeat reds), found by the
 * `master-ci-failure` label or title prefix. Retain the former Tests Gate
 * title for existing unlabeled trackers: GitHub can drop create-time labels.
 * A separate addLabels call preserves deduplication.
 * Native issue Priority P0 via the shared board triage.
 * Success path: close every open aggregate tracker — labeled or unlabeled
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
export const MASTER_CI_FAILURE_TITLE_PREFIX = '🚨 Full Suite failed on master';

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
  return (
    title.startsWith(MASTER_CI_FAILURE_TITLE_PREFIX) ||
    title.startsWith('🚨 Tests Gate failed on master push')
  );
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
 * Open aggregate trackers, including earlier Tests Gate titles. Sorted by
 * issue number so resolve and canonical-pick are deterministic. Trackers owned by another workflow
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
      description: 'Full Suite aggregate verification is failing on master',
    });
  }
}

/**
 * Build the issue / comment body for a red Full Suite aggregate.
 * @param {{ date: string, sha: string, headline: string, runUrl: string }} input
 */
export function buildMasterCiFailureBody({
  date,
  sha,
  headline,
  runUrl,
  results = {},
}) {
  return [
    `**Full Suite failed on \`master\`** on \`${date}\`.`,
    ``,
    `- Commit: \`${sha}\` — ${headline}`,
    `- Failed run: ${runUrl}`,
    `- Aggregate gates: ${Object.entries(results)
      .map(([name, result]) => `${name}=${result}`)
      .join(', ')}`,
    `- The run's Master SHA Verdict includes CI, build, E2E and requested connected acceptance.`,
    ``,
    `The trunk is red: every branch cut from \`master\` inherits this failure.`,
    `Automation sets native issue **Priority = P0** (Priority is structured issue metadata, not a label).`,
    `This tracker closes automatically on a complete green Full Suite verdict for the current master SHA.`,
  ].join('\n');
}

export async function updateMasterCiFailureFromVerdict({
  github,
  projectGithub = github,
  owner,
  repo,
  defaultBranch,
  sha,
  verdict,
  results,
  date,
  headline,
  runUrl,
  core = console,
}) {
  if (
    !['success', 'failure'].includes(verdict) ||
    Object.values(results).includes('cancelled')
  ) {
    return { action: 'ignored', reason: 'incomplete-verification' };
  }

  const { data } = await github.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  if (data.object.sha !== sha) {
    core.info?.('Ignoring Full Suite verdict for a stale or nontrunk SHA');
    return { action: 'ignored', reason: 'not-current-trunk' };
  }

  if (verdict === 'failure') {
    return reportMasterCiFailure({
      github,
      projectGithub,
      owner,
      repo,
      body: buildMasterCiFailureBody({ date, sha, headline, runUrl, results }),
      date,
      core,
    });
  }

  return resolveMasterCiFailure({
    github,
    owner,
    repo,
    body: [
      `**Full Suite is green on \`master\`** on \`${date}\`.`,
      '',
      `- Commit: \`${sha}\` — ${headline}`,
      `- Green run: ${runUrl}`,
      '',
      'Closing automatically after complete aggregate verification at the current master SHA.',
    ].join('\n'),
    core,
  });
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
  // Re-assert P0 every red aggregate so backlog drift cannot deprioritize it.
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
      `Closed master-ci-failure issue #${issue.number} after green Full Suite`,
    );
  }

  return { action: 'closed', closed };
}
