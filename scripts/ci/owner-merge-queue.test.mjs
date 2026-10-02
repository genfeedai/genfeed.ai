import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  admission,
  cancelSuperseded,
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
    head_sha: 'head',
    event: name === 'pr-title' ? 'pull_request_target' : 'pull_request',
    pull_requests: [{ number: 1 }],
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
  assert.equal(
    checksReady(f.checks, f.statuses, f.runs, { head: 'head', number: 1 }),
    true,
  );
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
      x.runs[0].head_sha = 'stale';
    },
    (x) => {
      x.runs[0].event = 'workflow_dispatch';
    },
    (x) => {
      x.runs[0].pull_requests = [{ number: 99 }];
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
    assert.equal(
      checksReady(x.checks, x.statuses, x.runs, { head: 'head', number: 1 }),
      false,
    );
  }
  for (const result of ['skipped', 'neutral', 'cancelled', null]) {
    const x = fixture();
    x.checks[0].conclusion = result;
    assert.equal(
      checksReady(x.checks, x.statuses, x.runs, { head: 'head', number: 1 }),
      false,
    );
  }
});

test('strict rule requires visible empty bypass list and exact master protections', () => {
  assert.equal(
    verifyRuleset(
      JSON.parse(
        readFileSync(
          new URL('./owner-merge-ruleset.json', import.meta.url),
          'utf8',
        ),
      ),
    ),
    true,
  );
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
        merge: operation('merge', () => ({
          data: { merged: true, sha: 'merged' },
        })),
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

test('refuses unconfirmed merge responses', async () => {
  const mock = client(fixture());
  mock.github.rest.pulls.merge = async () => ({
    data: { merged: false, message: 'blocked' },
  });
  await assert.rejects(
    reconcile({
      github: mock.github,
      mode: 'strict',
      rulesetId: '123',
      log: () => {},
    }),
    /Merge not confirmed/,
  );
  mock.github.rest.pulls.merge = async () => {
    throw new Error('head race');
  };
  await assert.rejects(
    reconcile({
      github: mock.github,
      mode: 'strict',
      rulesetId: '123',
      log: () => {},
    }),
    /head race/,
  );
});

test('does not update a conflicting or unknown branch', async () => {
  for (const mergeable of [false, null]) {
    const f = fixture();
    f.pr.mergeable = mergeable;
    const mock = client(f, { behind: true });
    await reconcile({
      github: mock.github,
      mode: 'strict',
      rulesetId: '123',
      log: () => {},
    });
    assert.equal(
      mock.calls.some((call) => ['update', 'merge'].includes(call.name)),
      false,
    );
  }
});

test('waits for an active current-base CI lane before updating another green behind PR', async () => {
  const f = fixture(),
    mock = client(f);
  // Candidate 1 is behind and green; candidate 2 already contains master but
  // its fresh CI is queued. Candidate order must not affect the backoff.
  const other = { ...f.pr, number: 2, head: { ...f.pr.head, sha: 'active' } };
  const paginate = mock.github.paginate;
  mock.github.paginate = async (method, args) => {
    if (method.operation === 'pulls') return [f.pr, other];
    if (method.operation === 'runs' && args.head_sha === 'active')
      return [
        {
          ...f.runs[0],
          head_sha: 'active',
          status: 'queued',
          conclusion: null,
        },
      ];
    return paginate(method, args);
  };
  mock.github.rest.pulls.get = async ({ pull_number }) => ({
    data: pull_number === 2 ? other : f.pr,
  });
  mock.github.rest.repos.compareCommits = async ({ head }) => ({
    data: { status: head === 'active' ? 'ahead' : 'diverged' },
  });
  for (let sweep = 0; sweep < 2; sweep++)
    await reconcile({
      github: mock.github,
      mode: 'strict',
      rulesetId: '123',
      log: () => {},
    });
  assert.equal(
    mock.calls.some((call) => ['merge', 'update'].includes(call.name)),
    false,
  );
});

function cleanupClient({
  queued = false,
  stranded = false,
  reusable = false,
  restore = false,
  completed = false,
  shared = false,
  runs = 1,
  mutate = () => {},
} = {}) {
  const pr = fixture().pr;
  pr.head.ref = 'owner-branch';
  const stale = {
    id: 10,
    event: 'pull_request',
    path: reusable
      ? '.github/workflows/pr-heavy-ci.yml'
      : '.github/workflows/ci.yml',
    status: queued ? 'queued' : 'in_progress',
    head_branch: pr.head.ref,
    head_sha: 'obsolete',
    repository: { id: REPOSITORY.id },
    head_repository: { id: REPOSITORY.id },
    pull_requests: [{ number: 1 }],
  };
  mutate(pr, stale);
  const pulls = shared
    ? [pr, { ...pr, number: 2, head: { ...pr.head, sha: 'obsolete' } }]
    : [pr];
  const calls = [];
  let prReads = 0,
    runReads = 0;
  const operation = (name) =>
    Object.assign(
      async (args) => {
        calls.push({ name, args });
        return {};
      },
      { operation: name },
    );
  const github = {
    rest: {
      actions: {
        listWorkflowRunsForRepo: { operation: 'runs' },
        listJobsForWorkflowRun: { operation: 'jobs' },
        getWorkflowRun: async ({ run_id }) => ({
          data: {
            ...stale,
            id: run_id,
            status: completed && ++runReads > 1 ? 'completed' : stale.status,
          },
        }),
        cancelWorkflowRun: operation('cancel'),
        forceCancelWorkflowRun: operation('force'),
      },
      pulls: {
        get: async () => ({
          data: {
            ...pr,
            head: {
              ...pr.head,
              sha: restore && ++prReads > 1 ? 'obsolete' : pr.head.sha,
            },
          },
        }),
      },
    },
    paginate: async (method, args) =>
      method.operation === 'jobs'
        ? stranded
          ? [
              { conclusion: 'cancelled' },
              {
                name: reusable ? 'Run Heavy CI / Tests Gate' : 'Tests Gate',
                status: 'queued',
              },
            ]
          : []
        : args.status === stale.status
          ? Array.from({ length: runs }, (_, index) => ({
              ...stale,
              id: stale.id + index,
            }))
          : [],
  };
  return { github, pulls, calls };
}

test('cancels stale running CI and stranded gates but ordinarily cancels queued CI', async () => {
  for (const options of [
    {},
    { queued: true },
    { queued: true, stranded: true },
    { queued: true, stranded: true, reusable: true },
  ]) {
    const mock = cleanupClient(options);
    await cancelSuperseded({ ...mock, log: () => {} });
    assert.equal(mock.calls.length, 1);
    assert.equal(
      mock.calls[0].name,
      options.queued && !options.stranded ? 'cancel' : 'force',
    );
  }
});

test('superseded cleanup preserves current, shared, restored, foreign and non-PR verification', async () => {
  const cases = [
    { restore: true },
    { completed: true },
    { shared: true },
    {
      mutate: (pr, run) => {
        run.head_sha = pr.head.sha;
      },
    },
    {
      mutate: (pr) => {
        pr.user.id++;
      },
    },
    {
      mutate: (pr) => {
        pr.head.repo.id++;
      },
    },
    {
      mutate: (_pr, run) => {
        run.head_repository.id++;
      },
    },
    {
      mutate: (_pr, run) => {
        run.repository.id++;
      },
    },
    {
      mutate: (_pr, run) => {
        run.event = 'push';
      },
    },
    {
      mutate: (_pr, run) => {
        run.event = 'merge_group';
      },
    },
    {
      mutate: (_pr, run) => {
        run.path = '.github/workflows/release.yml';
      },
    },
    {
      mutate: (_pr, run) => {
        run.pull_requests = [];
      },
    },
    {
      mutate: (_pr, run) => {
        run.head_branch = 'other';
      },
    },
  ];
  for (const options of cases) {
    const mock = cleanupClient(options);
    await cancelSuperseded({ ...mock, log: () => {} });
    assert.equal(mock.calls.length, 0);
  }
});

test('bounds cleanup to five cancellation requests per sweep', async () => {
  const mock = cleanupClient({ runs: 9 });
  await cancelSuperseded({ ...mock, log: () => {} });
  assert.equal(mock.calls.length, 5);
});

test('counts completed-between-reads errors against the cancellation budget', async () => {
  const mock = cleanupClient({ runs: 9 });
  const get = mock.github.rest.actions.getWorkflowRun;
  const attempted = new Set();
  mock.github.rest.actions.forceCancelWorkflowRun = async ({ run_id }) => {
    attempted.add(run_id);
    throw new Error('already completed');
  };
  mock.github.rest.actions.getWorkflowRun = async (args) => {
    const value = await get(args);
    if (attempted.has(args.run_id)) value.data.status = 'completed';
    return value;
  };
  await cancelSuperseded({ ...mock, log: () => {} });
  assert.equal(attempted.size, 5);
});

test('controller metadata cannot block itself or mask required and unrelated validation', () => {
  for (const conclusion of [null, 'failure']) {
    const f = fixture();
    const ownRun = {
      id: 30,
      workflow_id: 30,
      path: '.github/workflows/owner-merge-queue.yml',
      check_suite_id: 30,
      status: conclusion ? 'completed' : 'in_progress',
      conclusion,
    };
    const ownCheck = {
      id: 30,
      name: 'reconcile',
      app: { id: 15368 },
      check_suite: { id: 30 },
      status: ownRun.status,
      conclusion,
    };
    f.runs.push(ownRun);
    f.checks.push(ownCheck);
    const ready = () =>
      checksReady(f.checks, f.statuses, f.runs, { head: 'head', number: 1 });
    assert.equal(ready(), true);
    ownCheck.app.id = 99;
    assert.equal(ready(), false);
    ownCheck.app.id = 15368;
    ownCheck.name = 'Tests Gate';
    assert.equal(ready(), false);
    ownCheck.name = 'reconcile';
    ownRun.path = '.github/workflows/other.yml';
    assert.equal(ready(), false);
    ownRun.path = '.github/workflows/owner-merge-queue.yml';
    f.statuses.push({ id: 80, context: 'other', state: 'pending' });
    assert.equal(ready(), false);
  }
});
