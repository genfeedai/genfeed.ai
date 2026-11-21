/**
 * Stale branch report: lists the remote branches that are not on master and
 * says what each one needs, so finished work cannot sit on a branch unseen.
 *
 * The scan is read-only against the branches, compare and pull request APIs.
 * It never deletes, pushes or merges anything. The only write is the one
 * rolling tracking issue that holds the report. Branches under `codex/` and
 * `grok/` belong to other agents: they are listed, never given an action.
 */

export const STALE_BRANCHES_LABEL = 'stale-branches';
export const STALE_BRANCHES_MARKER = 'genfeed-stale-branches:v1';
export const STALE_BRANCHES_TITLE =
  'Stale branches: remote branches that are not on master';
// A branch younger than this is still being worked on.
export const STRANDED_AFTER_HOURS = 24;
// An open pull request nobody touched for this long is stalled.
export const STALLED_PR_DAYS = 7;
export const OWNED_ELSEWHERE_PREFIXES = ['codex/', 'grok/'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PAGE_SIZE = 100;

export const BRANCH_KINDS = {
  abandoned: {
    action: 'Reopen the pull request, or delete the branch if it is replaced',
    group: 'decide',
    heading: 'Pull request closed without merging',
  },
  'after-merge': {
    action:
      'Commits landed after the pull request merged: open a new pull request or delete',
    group: 'open-pr',
    heading: 'New commits after the pull request merged',
  },
  merged: {
    action: 'Nothing unique on the branch: delete it',
    group: 'delete',
    heading: 'Already on master',
  },
  'merged-pr': {
    action: 'Its pull request merged (squash): delete the branch',
    group: 'delete',
    heading: 'Pull request merged, branch left behind',
  },
  'owned-elsewhere': {
    action: 'Owned by another agent: list only, never touch',
    group: 'owned',
    heading: 'Owned by another agent',
  },
  stalled: {
    action: 'Open pull request without activity: merge it, fix it or close it',
    group: 'decide',
    heading: 'Open pull request stalled',
  },
  stranded: {
    action: 'Work with no pull request: open one and get it merged',
    group: 'open-pr',
    heading: 'No pull request',
  },
};

const GROUP_ORDER = [
  ['open-pr', 'Open a pull request (work is not shipped)'],
  ['decide', 'Decide: merge, reopen or close'],
  ['delete', 'Delete (nothing unique left)'],
  ['owned', 'Owned by another agent (list only)'],
];

/**
 * Decides what one branch needs. `ahead` is its commit count over the default
 * branch, `committedAt` the date of its newest commit, `pulls` every pull
 * request whose head is this branch, open or closed.
 * Returns null when nothing is needed (in review, or still young).
 */
export function classifyBranch({ name, ahead, committedAt, pulls }, now) {
  if (OWNED_ELSEWHERE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return 'owned-elsewhere';
  }
  if (ahead === 0) return 'merged';
  const open = pulls.filter((pull) => pull.state === 'open');
  if (open.length > 0) {
    const lastActivity = Math.max(
      ...open.map((pull) => Date.parse(pull.updated_at)),
    );
    return now - lastActivity > STALLED_PR_DAYS * DAY_MS ? 'stalled' : null;
  }
  if (pulls.length === 0) {
    return now - Date.parse(committedAt) > STRANDED_AFTER_HOURS * HOUR_MS
      ? 'stranded'
      : null;
  }
  const mergedAt = pulls
    .filter((pull) => pull.merged_at)
    .map((pull) => Date.parse(pull.merged_at));
  if (mergedAt.length === 0) return 'abandoned';
  return Date.parse(committedAt) > Math.max(...mergedAt)
    ? 'after-merge'
    : 'merged-pr';
}

export function buildBranchReport(branches, now) {
  const entries = [];
  for (const branch of branches) {
    const kind = classifyBranch(branch, now);
    if (kind) entries.push({ ...branch, kind });
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function describePulls(pulls) {
  if (pulls.length === 0) return 'none';
  return pulls
    .map((pull) => {
      const state = pull.merged_at ? 'merged' : pull.state;
      return `#${pull.number} ${state}`;
    })
    .join(', ');
}

export function renderBranchReport(
  entries,
  { defaultBranch, generatedAt, runUrl = null },
) {
  const lines = [
    `<!-- ${STALE_BRANCHES_MARKER} -->`,
    `# ${STALE_BRANCHES_TITLE}`,
    '',
    `Generated ${generatedAt} against \`${defaultBranch}\`.`,
    runUrl ? `Run: ${runUrl}` : null,
    '',
    'Read-only report. Finished work is a pull request on `master`, not a branch: a branch with commits and no pull request is work nobody can see.',
    '',
  ].filter((line) => line !== null);

  if (entries.length === 0) {
    lines.push('No stale branches.');
    return lines.join('\n');
  }

  for (const [group, title] of GROUP_ORDER) {
    const rows = entries.filter(
      (entry) => BRANCH_KINDS[entry.kind].group === group,
    );
    if (rows.length === 0) continue;
    lines.push(`## ${title}`, '');
    lines.push('| Branch | Ahead | Last commit | Pull requests | Why |');
    lines.push('| --- | ---: | --- | --- | --- |');
    for (const row of rows) {
      lines.push(
        `| \`${row.name}\` | ${row.ahead} | ${row.committedAt.slice(0, 10)} | ${describePulls(row.pulls)} | ${BRANCH_KINDS[row.kind].action} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export async function collectBranches({ github, owner, repo, defaultBranch }) {
  const names = (
    await github.paginate(github.rest.repos.listBranches, {
      owner,
      repo,
      per_page: PAGE_SIZE,
    })
  )
    .map((branch) => branch.name)
    .filter((name) => name !== defaultBranch);

  const branches = [];
  for (const name of names) {
    const [compared, head, pulls] = await Promise.all([
      github.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${defaultBranch}...${name}`,
        per_page: 1,
      }),
      github.rest.repos.getBranch({ owner, repo, branch: name }),
      github.paginate(github.rest.pulls.list, {
        owner,
        repo,
        head: `${owner}:${name}`,
        state: 'all',
        per_page: PAGE_SIZE,
      }),
    ]);
    branches.push({
      ahead: compared.data.ahead_by,
      committedAt: head.data.commit.commit.committer.date,
      name,
      pulls,
    });
  }
  return branches;
}

async function ensureLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: STALE_BRANCHES_LABEL,
    });
  } catch (error) {
    if (error?.status !== 404) throw error;
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: STALE_BRANCHES_LABEL,
      color: 'fbca04',
      description: 'Weekly report of remote branches that are not on master',
    });
  }
}

/**
 * Keeps one rolling tracking issue current: opened when a branch needs an
 * action, refreshed while it exists, closed once the report is empty.
 */
export async function syncBranchTracker({
  github,
  owner,
  repo,
  body,
  hasActions,
  core = console,
}) {
  await ensureLabel(github, { owner, repo });
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: STALE_BRANCHES_LABEL,
    per_page: PAGE_SIZE,
  });
  const tracker = open.find(
    (issue) =>
      !issue.pull_request && issue.body?.includes(STALE_BRANCHES_MARKER),
  );
  if (tracker) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: tracker.number,
      body,
      state: hasActions ? 'open' : 'closed',
    });
    core.info?.(`Updated stale branch report #${tracker.number}`);
    return tracker.number;
  }
  if (!hasActions) return null;
  const created = await github.rest.issues.create({
    owner,
    repo,
    title: STALE_BRANCHES_TITLE,
    body,
    labels: [STALE_BRANCHES_LABEL],
  });
  core.info?.(`Created stale branch report #${created.data.number}`);
  return created.data.number;
}

export async function runStaleBranchReport({
  github,
  owner,
  repo,
  now = Date.now(),
  runUrl = null,
  core = console,
}) {
  const { data } = await github.rest.repos.get({ owner, repo });
  const defaultBranch = data.default_branch;
  const branches = await collectBranches({
    github,
    owner,
    repo,
    defaultBranch,
  });
  const entries = buildBranchReport(branches, now);
  const markdown = renderBranchReport(entries, {
    defaultBranch,
    generatedAt: new Date(now).toISOString(),
    runUrl,
  });
  await core.summary?.addRaw(markdown, true).write();
  const hasActions = entries.some((entry) => entry.kind !== 'owned-elsewhere');
  const issueNumber = await syncBranchTracker({
    github,
    owner,
    repo,
    body: markdown,
    hasActions,
    core,
  });
  return { entries, issueNumber, markdown };
}
