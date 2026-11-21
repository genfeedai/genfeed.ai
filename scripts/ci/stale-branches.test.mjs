import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBranchReport,
  classifyBranch,
  renderBranchReport,
  runStaleBranchReport,
  STALE_BRANCHES_MARKER,
} from './stale-branches.mjs';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const OWNER = 'genfeedai';
const REPO = 'genfeed.ai';

function branch(name, overrides = {}) {
  return {
    ahead: 2,
    committedAt: '2026-11-10T09:00:00Z',
    name,
    pulls: [],
    ...overrides,
  };
}

function pull(number, state, overrides = {}) {
  return {
    merged_at: null,
    number,
    state,
    updated_at: '2026-11-20T09:00:00Z',
    ...overrides,
  };
}

test('work on a branch with no pull request is stranded once a day old', () => {
  assert.equal(classifyBranch(branch('claude/redesign'), NOW), 'stranded');
  assert.equal(
    classifyBranch(
      branch('claude/redesign', { committedAt: '2026-11-21T08:00:00Z' }),
      NOW,
    ),
    null,
    'a branch hours old is still being worked on',
  );
});

test('a branch with nothing ahead of master is merged, whatever its pull requests', () => {
  assert.equal(classifyBranch(branch('x', { ahead: 0 }), NOW), 'merged');
  assert.equal(
    classifyBranch(branch('x', { ahead: 0, pulls: [pull(1, 'open')] }), NOW),
    'merged',
  );
});

test('an open pull request is in review until it sits a week untouched', () => {
  assert.equal(
    classifyBranch(branch('x', { pulls: [pull(1, 'open')] }), NOW),
    null,
  );
  assert.equal(
    classifyBranch(
      branch('x', {
        pulls: [pull(1, 'open', { updated_at: '2026-11-01T09:00:00Z' })],
      }),
      NOW,
    ),
    'stalled',
  );
});

test('closed pull requests tell merged leftovers from abandoned and later work', () => {
  const merged = pull(5, 'closed', { merged_at: '2026-11-15T10:00:00Z' });
  assert.equal(
    classifyBranch(
      branch('x', { committedAt: '2026-11-15T09:59:00Z', pulls: [merged] }),
      NOW,
    ),
    'merged-pr',
  );
  assert.equal(
    classifyBranch(
      branch('x', { committedAt: '2026-11-16T09:00:00Z', pulls: [merged] }),
      NOW,
    ),
    'after-merge',
  );
  assert.equal(
    classifyBranch(branch('x', { pulls: [pull(6, 'closed')] }), NOW),
    'abandoned',
  );
});

test('codex and grok branches are only listed, whatever state they are in', () => {
  for (const name of ['codex/wip', 'grok/spike']) {
    assert.equal(classifyBranch(branch(name), NOW), 'owned-elsewhere');
    assert.equal(
      classifyBranch(branch(name, { ahead: 0 }), NOW),
      'owned-elsewhere',
    );
  }
});

test('the report is sorted, groups actions and says why for each branch', () => {
  const entries = buildBranchReport(
    [
      branch('claude/stranded'),
      branch('chore/done', { ahead: 0 }),
      branch('codex/other'),
      branch('claude/young', { committedAt: '2026-11-21T10:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(
    entries.map((entry) => [entry.name, entry.kind]),
    [
      ['chore/done', 'merged'],
      ['claude/stranded', 'stranded'],
      ['codex/other', 'owned-elsewhere'],
    ],
  );
  const markdown = renderBranchReport(entries, {
    defaultBranch: 'master',
    generatedAt: '2026-11-21T12:00:00.000Z',
  });
  assert.ok(
    markdown.indexOf('## Open a pull request') < markdown.indexOf('## Delete'),
  );
  assert.ok(
    markdown.indexOf('## Delete') <
      markdown.indexOf('## Owned by another agent'),
  );
  assert.match(
    markdown,
    /\| `claude\/stranded` \| 2 \| 2026-11-10 \| none \| Work with no pull request/u,
  );
  assert.match(markdown, new RegExp(STALE_BRANCHES_MARKER, 'u'));
});

function fakeGithub({ branches, issues = [] }) {
  const store = {
    issues: issues.map((issue) => ({ ...issue })),
    labels: new Set(),
  };
  const github = {
    async paginate(method, params) {
      return (await method(params)).data;
    },
    rest: {
      issues: {
        async create({ title, body, labels }) {
          const issue = {
            body,
            labels,
            number: 900 + store.issues.length,
            state: 'open',
            title,
          };
          store.issues.push(issue);
          return { data: issue };
        },
        async createLabel({ name }) {
          store.labels.add(name);
        },
        async getLabel({ name }) {
          if (!store.labels.has(name))
            throw Object.assign(new Error('missing'), { status: 404 });
        },
        async listForRepo() {
          return {
            data: store.issues.filter((issue) => issue.state === 'open'),
          };
        },
        async update({ issue_number, body, state }) {
          Object.assign(
            store.issues.find((issue) => issue.number === issue_number),
            { body, state },
          );
        },
      },
      pulls: {
        async list({ head }) {
          const name = head.split(':')[1];
          return { data: branches.find((entry) => entry.name === name).pulls };
        },
      },
      repos: {
        async compareCommitsWithBasehead({ basehead }) {
          const name = basehead.split('...')[1];
          return {
            data: {
              ahead_by: branches.find((entry) => entry.name === name).ahead,
            },
          };
        },
        async get() {
          return { data: { default_branch: 'master' } };
        },
        async getBranch({ branch: name }) {
          const found = branches.find((entry) => entry.name === name);
          return {
            data: {
              commit: { commit: { committer: { date: found.committedAt } } },
            },
          };
        },
        async listBranches() {
          return {
            data: [
              { name: 'master' },
              ...branches.map(({ name }) => ({ name })),
            ],
          };
        },
      },
    },
  };
  return { github, store };
}

test('the run opens one tracking issue, refreshes it and closes it when clean', async () => {
  const { github, store } = fakeGithub({
    branches: [branch('claude/stranded'), branch('codex/other')],
  });
  const first = await runStaleBranchReport({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
  assert.equal(first.entries.length, 2);
  assert.equal(store.issues.length, 1);
  assert.match(store.issues[0].body, /claude\/stranded/u);

  await runStaleBranchReport({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
  assert.equal(store.issues.length, 1, 'a second run updates the same issue');
  assert.equal(store.issues[0].state, 'open');

  const clean = fakeGithub({ branches: [branch('chore/done', { ahead: 0 })] });
  clean.store.issues.push({
    body: `<!-- ${STALE_BRANCHES_MARKER} -->`,
    number: 7,
    state: 'open',
  });
  clean.store.labels.add('stale-branches');
  await runStaleBranchReport({
    github: clean.github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
  assert.equal(
    clean.store.issues[0].state,
    'open',
    'a branch to delete is still an action',
  );

  const empty = fakeGithub({ branches: [branch('codex/other')] });
  empty.store.issues.push({
    body: `<!-- ${STALE_BRANCHES_MARKER} -->`,
    number: 8,
    state: 'open',
  });
  empty.store.labels.add('stale-branches');
  await runStaleBranchReport({
    github: empty.github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
  assert.equal(
    empty.store.issues[0].state,
    'closed',
    'only other agents’ branches left: nothing to do',
  );
});

test('with no stale branches and no tracking issue nothing is created', async () => {
  const { github, store } = fakeGithub({ branches: [] });
  const result = await runStaleBranchReport({
    github,
    owner: OWNER,
    repo: REPO,
    now: NOW,
    core: { info() {} },
  });
  assert.equal(result.issueNumber, null);
  assert.equal(store.issues.length, 0);
  assert.match(result.markdown, /No stale branches/u);
});
