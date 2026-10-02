import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admission,
  checksReady,
  OWNER_ID,
  REPOSITORY,
  REQUIRED,
  reconcile,
  verifyRuleset,
} from './owner-merge-queue.mjs';

function fixture() {
  const pr = {
    number: 1,
    state: 'open',
    draft: false,
    user: { id: OWNER_ID },
    head: { sha: 'head', repo: { id: REPOSITORY.id } },
    base: { ref: 'master', repo: { id: REPOSITORY.id } },
    labels: [],
    mergeable: true,
    mergeable_state: 'clean',
  };
  const reviews = { requests: [], threads: [], reviews: [] };
  const checks = REQUIRED.filter((check) => check.integration_id).map(
    (check, index) => ({
      id: index + 1,
      name: check.context,
      app: {
        id: check.integration_id,
        slug:
          check.integration_id === 156372
            ? 'socket-security'
            : 'github-actions',
      },
      check_suite: { id: index + 1 },
      status: 'completed',
      conclusion: 'success',
    }),
  );
  const runs = ['ci', 'pr-title'].map((name, index) => ({
    id: index + 1,
    workflow_id: index + 1,
    check_suite_id: index + 1,
    path: `.github/workflows/${name}.yml`,
    status: 'completed',
    conclusion: 'success',
  }));
  const statuses = [
    {
      id: 1,
      context: 'license/cla',
      state: 'success',
      creator: { id: OWNER_ID },
    },
  ];
  const rule = {
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { exclude: [], include: ['refs/heads/master'] } },
    rules: [
      { type: 'required_linear_history' },
      {
        type: 'pull_request',
        parameters: {
          require_code_owner_review: true,
          required_review_thread_resolution: true,
          require_extra_approval_for_unattributed_changes: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
          required_status_checks: REQUIRED,
        },
      },
    ],
  };
  return { pr, reviews, checks, runs, statuses, rule };
}

test('owner admission rejects foreign identity, forks, drafts and every review blocker', () => {
  const f = fixture();
  assert.equal(admission(f.pr, f.reviews), null);
  for (const mutate of [
    (x) => {
      x.pr.user.id++;
    },
    (x) => {
      x.pr.head.repo.id++;
    },
    (x) => {
      x.pr.base.repo.id++;
    },
    (x) => {
      x.pr.base.ref = 'other';
    },
    (x) => {
      x.pr.draft = true;
    },
    (x) => {
      x.pr.state = 'closed';
    },
    (x) => {
      x.pr.labels = [{ name: 'hold-merge' }];
    },
    (x) => {
      x.reviews.requests = [{}];
    },
    (x) => {
      x.reviews.threads = [{ isResolved: false, isOutdated: true }];
    },
    (x) => {
      x.pr.reviewDecision = 'REVIEW_REQUIRED';
    },
    (x) => {
      x.reviews.reviews = [{ state: 'PENDING' }];
    },
  ]) {
    const x = fixture();
    mutate(x);
    assert.ok(admission(x.pr, x.reviews));
  }
  f.reviews.reviews = [
    { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' },
    { author: { login: 'reviewer' }, state: 'COMMENTED' },
  ];
  assert.ok(admission(f.pr, f.reviews));
  f.reviews.reviews.push({ author: { login: 'reviewer' }, state: 'APPROVED' });
  assert.equal(admission(f.pr, f.reviews), null);
});

test('required successes bind authentic sources and latest attempts, optional failures block', () => {
  const f = fixture();
  assert.equal(checksReady(f.checks, f.statuses, f.runs), true);
  for (const mutate of [
    (x) => {
      x.checks.shift();
    },
    (x) => {
      x.checks[0].app.id++;
    },
    (x) => {
      x.checks[2].app.slug = 'other';
    },
    (x) => {
      x.statuses[0].creator.id++;
    },
    (x) => {
      x.runs[0].path = '.github/workflows/fake.yml';
    },
    (x) => {
      x.runs.push({ ...x.runs[0], id: 99, status: 'queued', conclusion: null });
    },
    (x) => {
      x.checks.push({
        ...x.checks[0],
        id: 99,
        status: 'in_progress',
        conclusion: null,
      });
    },
    (x) => {
      x.statuses.push({ ...x.statuses[0], id: 99, state: 'pending' });
    },
    (x) => {
      x.statuses.push({ id: 90, context: 'Tests Gate', state: 'failure' });
    },
    (x) => {
      x.checks.push({
        id: 90,
        name: 'optional',
        app: { id: 99 },
        status: 'completed',
        conclusion: 'failure',
      });
    },
  ]) {
    const x = fixture();
    mutate(x);
    assert.equal(checksReady(x.checks, x.statuses, x.runs), false);
  }
  for (const result of ['skipped', 'neutral', 'cancelled', null]) {
    const x = fixture();
    x.checks[0].conclusion = result;
    assert.equal(checksReady(x.checks, x.statuses, x.runs), false);
  }
});

test('strict rule requires visible empty bypass list and exact master protections', () => {
  assert.equal(verifyRuleset(fixture().rule), true);
  for (const mutate of [
    (x) => {
      delete x.bypass_actors;
    },
    (x) => {
      x.bypass_actors = [{ actor_id: 5 }];
    },
    (x) => {
      x.enforcement = 'evaluate';
    },
    (x) => {
      x.conditions.ref_name.include = ['~DEFAULT_BRANCH'];
    },
    (x) => {
      x.rules[2].parameters.strict_required_status_checks_policy = false;
    },
    (x) => {
      x.rules[2].parameters.required_status_checks = REQUIRED.slice(1);
    },
    (x) => {
      x.rules[1].parameters.required_review_thread_resolution = false;
    },
  ]) {
    const x = fixture().rule;
    mutate(x);
    assert.equal(verifyRuleset(x), false);
  }
});

function client(
  f,
  { behind = false, race = false, unresolvedPage = false } = {},
) {
  const calls = [];
  let reads = 0;
  const operation = (name, fn) =>
    Object.assign(
      async (args) => {
        calls.push({ name, args });
        return fn(args);
      },
      { operation: name },
    );
  const github = {
    rest: {
      repos: {
        getRepoRuleset: operation('rule', () => ({ data: f.rule })),
        getBranch: operation('base', () => ({
          data: { commit: { sha: 'base' } },
        })),
        compareCommits: operation('compare', () => ({
          data: { status: behind ? 'diverged' : 'ahead' },
        })),
        listCommitStatusesForRef: { operation: 'statuses' },
      },
      checks: { listForRef: { operation: 'checks' } },
      actions: { listWorkflowRunsForRepo: { operation: 'runs' } },
      pulls: {
        list: { operation: 'pulls' },
        get: operation('get', () => ({
          data: {
            ...f.pr,
            head: { ...f.pr.head, sha: race && ++reads > 1 ? 'new' : 'head' },
          },
        })),
        updateBranch: operation('update', () => ({})),
        merge: operation('merge', () => ({})),
      },
    },
    paginate: async (method) =>
      ({ pulls: [f.pr], checks: f.checks, statuses: f.statuses, runs: f.runs })[
        method.operation
      ],
    graphql: async (query, args) => {
      const field = ['reviewRequests', 'reviewThreads', 'reviews'].find(
        (name) => query.includes(`${name}(`),
      );
      if (!field)
        return { repository: { pullRequest: { reviewDecision: null } } };
      const nodes =
        field === 'reviewRequests'
          ? f.reviews.requests
          : field === 'reviewThreads'
            ? f.reviews.threads
            : f.reviews.reviews;
      const extra = unresolvedPage && field === 'reviewThreads';
      return {
        repository: {
          pullRequest: {
            [field]: {
              nodes: extra && args.cursor ? [{ isResolved: false }] : nodes,
              pageInfo: {
                hasNextPage: extra && !args.cursor,
                endCursor: 'next',
              },
            },
          },
        },
      };
    },
  };
  return { github, calls };
}

test('controller serializes expected-head mutations, revalidates, paginates and fails closed', async () => {
  for (const options of [
    {},
    { behind: true },
    { race: true },
    { unresolvedPage: true },
  ]) {
    const f = fixture(),
      mock = client(f, options);
    await reconcile({
      github: mock.github,
      mode: 'strict',
      rulesetId: '123',
      log: () => {},
    });
    const mutations = mock.calls.filter((call) =>
      ['merge', 'update'].includes(call.name),
    );
    if (options.race || options.unresolvedPage)
      assert.equal(mutations.length, 0);
    else {
      assert.equal(mutations.length, 1);
      assert.equal(mutations[0].name, options.behind ? 'update' : 'merge');
      assert.equal(
        mutations[0].args[options.behind ? 'expected_head_sha' : 'sha'],
        'head',
      );
      assert.equal(mock.calls.filter((call) => call.name === 'rule').length, 2);
    }
  }
  const f = fixture(),
    mock = client(f);
  await reconcile({ github: mock.github, mode: 'off', log: () => {} });
  assert.equal(mock.calls.length, 0);
  await assert.rejects(
    reconcile({ github: mock.github, mode: 'queue' }),
    /authentic group/,
  );
  await assert.rejects(
    reconcile({ github: mock.github, mode: 'strict' }),
    /ruleset ID/,
  );
  f.rule.bypass_actors = [{ actor_id: 5 }];
  await assert.rejects(
    reconcile({ github: mock.github, mode: 'strict', rulesetId: '123' }),
    /not verified/,
  );
  assert.equal(
    mock.calls.some((call) => call.name === 'merge'),
    false,
  );
});
