const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export const NIGHTLY_E2E_FAILURE_LABEL = 'nightly-e2e-failure';
export const NIGHTLY_E2E_FAILURE_TITLE = 'Nightly E2E suite is failing';
export const NIGHTLY_E2E_REOPEN_WINDOW_DAYS = 30;

function closedAtTimestamp(issue) {
  if (!issue?.closed_at) {
    return null;
  }

  const timestamp = Date.parse(issue.closed_at);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function selectNewestEligibleClosedTracker(issues, cutoff) {
  return (issues ?? [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      issue,
      timestamp: closedAtTimestamp(issue),
    }))
    .filter(
      (candidate) =>
        candidate.timestamp !== null && candidate.timestamp >= cutoff,
    )
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp ||
        Number(right.issue.number) - Number(left.issue.number),
    )[0]?.issue;
}

async function listTrackerIssues(github, { owner, repo, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: NIGHTLY_E2E_FAILURE_LABEL,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
}

async function ensureTrackerLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: NIGHTLY_E2E_FAILURE_LABEL,
    });
  } catch {
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: NIGHTLY_E2E_FAILURE_LABEL,
      color: 'd73a4a',
      description: 'Scheduled (nightly) E2E suite is failing',
    });
  }
}

export async function reportNightlyE2eFailure({
  github,
  owner,
  repo,
  body,
  now = Date.now(),
}) {
  await ensureTrackerLabel(github, { owner, repo });

  const openTrackers = await listTrackerIssues(github, {
    owner,
    repo,
    state: 'open',
  });
  const openTracker = openTrackers.find((issue) => !issue.pull_request);

  if (openTracker) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: openTracker.number,
      body,
    });
    return { action: 'commented', issueNumber: openTracker.number };
  }

  const closedTrackers = await listTrackerIssues(github, {
    owner,
    repo,
    state: 'closed',
  });
  const cutoff = now - NIGHTLY_E2E_REOPEN_WINDOW_DAYS * DAY_IN_MILLISECONDS;
  const revivable = selectNewestEligibleClosedTracker(closedTrackers, cutoff);

  if (revivable) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: revivable.number,
      state: 'open',
    });
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: revivable.number,
      body: `${body}\n\nReopened automatically: this is the newest tracker closed within the last ${NIGHTLY_E2E_REOPEN_WINDOW_DAYS} days, and the nightly is red again.`,
    });
    return { action: 'reopened', issueNumber: revivable.number };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: NIGHTLY_E2E_FAILURE_TITLE,
    body,
    labels: [NIGHTLY_E2E_FAILURE_LABEL],
  });

  return { action: 'created', issueNumber: created.data.number };
}
