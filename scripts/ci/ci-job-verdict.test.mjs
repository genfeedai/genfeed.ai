import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyMembership,
  expectedIdentity,
  main,
  qualifyVerdict,
  validateRun,
  validateVerdict,
} from './ci-job-verdict.mjs';

const source = 'a'.repeat(40);
const head = 'b'.repeat(40);
const repository = 'genfeedai/genfeed.ai';
const env = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  EXPECTED_EVENT: 'pull_request',
  EXPECTED_WORKFLOW_REF: `${repository}/.github/workflows/ci.yml@refs/pull/42/merge`,
  EXPECTED_SOURCE_SHA: source,
  EXPECTED_PR_NUMBER: '42',
  EXPECTED_PR_HEAD: head,
};
const expected = expectedIdentity(env);
function run(overrides = {}) {
  return {
    id: 123,
    run_attempt: 2,
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    workflow_id: 256227164,
    repository: { full_name: repository },
    head_sha: head,
    pull_requests: [
      {
        number: 42,
        head: { sha: head },
        base: { repo: { url: `https://api.github.com/repos/${repository}` } },
      },
    ],
    referenced_workflows: [
      {
        path: `${repository}/.github/workflows/_ci-validation.yml@${source}`,
        sha: source,
      },
    ],
    ...overrides,
  };
}
function job(overrides = {}) {
  return {
    id: 11,
    run_id: 123,
    run_attempt: 2,
    head_sha: head,
    name: expected.jobName,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}
function pullRequest(overrides = {}) {
  return {
    number: 42,
    state: 'closed',
    merged: true,
    head: { sha: head },
    base: { repo: { full_name: repository } },
    ...overrides,
  };
}
const mergedMidRun = () => run({ pull_requests: [] });
function reader({
  metadata = run(),
  pull = pullRequest(),
  jobs = [job()],
  replies = [],
  finalRun = metadata,
  pageTransform = (value) => value,
} = {}) {
  const calls = [];
  let runReads = 0;
  const get = async (route, timeout) => {
    calls.push({ route, timeout });
    if (replies.length) return replies.shift();
    if (route.includes('/pulls/')) return { status: 200, body: pull };
    if (!route.includes('/jobs?')) {
      return { status: 200, body: runReads++ === 0 ? metadata : finalRun };
    }
    const page = Number(
      new URL(`https://api.github.com${route}`).searchParams.get('page'),
    );
    return {
      status: 200,
      body: pageTransform(
        {
          total_count: jobs.length,
          jobs: jobs.slice((page - 1) * 100, page * 100),
        },
        page,
      ),
    };
  };
  return { get, calls };
}

test('qualifies own genuine success and rereads attempt identity', async () => {
  const api = reader();
  assert.equal((await qualifyVerdict(expected, api)).id, 11);
  assert.deepEqual(
    api.calls.map((call) => call.route),
    [
      `/repos/${repository}/actions/runs/123`,
      '/repos/' +
        repository +
        '/actions/runs/123/attempts/2/jobs?per_page=100&page=1',
      `/repos/${repository}/actions/runs/123`,
    ],
  );
  assert.ok(
    api.calls.every((call) => call.timeout > 0 && call.timeout <= 10_000),
  );
});
test('PR head and tested merge source remain distinct', () => {
  assert.equal(validateVerdict(run(), [job()], expected).id, 11);
  assert.equal(
    validateVerdict(
      run({ head_sha: source }),
      [job({ head_sha: source })],
      expected,
    ).id,
    11,
  );
  assert.throws(() => validateRun(run({ head_sha: 'c'.repeat(40) }), expected));
});
for (const status of [
  'queued',
  'in_progress',
  'waiting',
  'pending',
  'requested',
  'unknown',
]) {
  test(`rejects actual status ${status}`, () =>
    assert.throws(() => validateVerdict(run(), [job({ status })], expected)));
}
for (const conclusion of [
  null,
  '',
  'failure',
  'skipped',
  'cancelled',
  'timed_out',
  'neutral',
  'stale',
  'action_required',
  'unknown',
]) {
  test(`rejects actual conclusion ${conclusion}`, () =>
    assert.throws(() =>
      validateVerdict(run(), [job({ conclusion })], expected),
    ));
}
for (const [key, value] of Object.entries({
  id: 124,
  run_attempt: 1,
  event: 'push',
  path: '.github/workflows/fake.yml',
  workflow_id: 1,
  repository: { full_name: 'other/repo' },
  head_sha: '',
})) {
  test(`rejects mismatched run ${key}`, () =>
    assert.throws(() => validateRun(run({ [key]: value }), expected)));
}
for (const [key, value] of Object.entries({
  run_id: 124,
  run_attempt: 1,
  head_sha: source,
  id: 0,
})) {
  test(`rejects foreign job ${key}`, () =>
    assert.throws(() =>
      validateVerdict(run(), [job({ [key]: value })], expected),
    ));
}
test('no suffix stripping, output or workflow conclusion can authorize a verdict', () => {
  const fake = run({ conclusion: 'success', outputs: { passed: true } });
  assert.throws(() =>
    validateVerdict(
      fake,
      [job({ name: `Fake / ${expected.jobName}` })],
      expected,
    ),
  );
  assert.throws(() =>
    validateVerdict(
      fake,
      [job({ conclusion: 'failure', outputs: { passed: true } })],
      expected,
    ),
  );
});
test('rejects duplicate exact job names and duplicate IDs', () => {
  assert.throws(() =>
    validateVerdict(run(), [job(), job({ id: 12 })], expected),
  );
  assert.throws(() =>
    validateVerdict(run(), [job(), job({ name: 'Plan' })], expected),
  );
});
for (const pr of [
  [],
  [{ number: 43, head: { sha: head } }],
  [{ number: 42, head: { sha: source } }],
]) {
  test(`rejects missing or foreign PR membership ${JSON.stringify(pr)}`, () =>
    assert.throws(() => validateRun(run({ pull_requests: pr }), expected)));
}
for (const references of [
  undefined,
  [],
  [
    {
      path: `${repository}/.github/workflows/_ci-validation.yml@main`,
      sha: head,
    },
  ],
  [run().referenced_workflows[0], run().referenced_workflows[0]],
]) {
  test(
    'rejects missing mismatched or duplicate source evidence ' +
      JSON.stringify(references),
    () =>
      assert.throws(() =>
        validateRun(run({ referenced_workflows: references }), expected),
      ),
  );
}
test('known heavy caller requires its exact prefixed inner name', () => {
  const heavy = expectedIdentity({
    ...env,
    EXPECTED_WORKFLOW_REF: `${repository}/.github/workflows/pr-heavy-ci.yml@refs/heads/master`,
  });
  assert.equal(
    validateVerdict(
      run({ path: heavy.workflowPath, workflow_id: heavy.workflowId }),
      [job({ name: heavy.jobName })],
      heavy,
    ).id,
    11,
  );
  assert.throws(() =>
    validateVerdict(
      run({ path: heavy.workflowPath, workflow_id: heavy.workflowId }),
      [job()],
      heavy,
    ),
  );
});
for (const overrides of [
  { GITHUB_REPOSITORY: '../evil' },
  { GITHUB_RUN_ID: '0' },
  { GITHUB_RUN_ATTEMPT: '0' },
  { EXPECTED_EVENT: 'pull_request_target' },
  { EXPECTED_SOURCE_SHA: 'abc' },
  { EXPECTED_PR_HEAD: '' },
  { EXPECTED_PR_NUMBER: '0' },
  { EXPECTED_WORKFLOW_REF: 'https://evil/token' },
  { EXPECTED_WORKFLOW_REF: `${repository}/.github/workflows/unknown.yml@main` },
]) {
  test(`rejects invalid trusted context ${JSON.stringify(overrides)}`, () =>
    assert.throws(() => expectedIdentity({ ...env, ...overrides })));
}
for (const event of ['merge_group', 'push']) {
  test(`qualifies exact non-PR tested source for ${event}`, () => {
    const identity = expectedIdentity({ ...env, EXPECTED_EVENT: event });
    assert.equal(
      validateVerdict(
        run({ event, head_sha: source }),
        [job({ head_sha: source })],
        identity,
      ).id,
      11,
    );
    assert.throws(() => validateRun(run({ event }), identity));
  });
}
test('a pull request that merges mid-run still qualifies from its exact pull request evidence', async () => {
  const api = reader({ metadata: mergedMidRun() });
  assert.equal((await qualifyVerdict(expected, api)).id, 11);
  assert.deepEqual(
    api.calls.map((call) => call.route),
    [
      `/repos/${repository}/actions/runs/123`,
      `/repos/${repository}/pulls/42`,
      '/repos/' +
        repository +
        '/actions/runs/123/attempts/2/jobs?per_page=100&page=1',
      `/repos/${repository}/actions/runs/123`,
      `/repos/${repository}/pulls/42`,
    ],
  );
});

test('an open pull request missing from the run list qualifies from pull request evidence', async () => {
  const api = reader({
    metadata: mergedMidRun(),
    pull: pullRequest({ state: 'open', merged: false }),
  });
  assert.equal((await qualifyVerdict(expected, api)).id, 11);
});

test('classifies membership as listed, open or merged', () => {
  assert.equal(classifyMembership(run(), expected), 'listed');
  assert.equal(
    classifyMembership(mergedMidRun(), expected, pullRequest()),
    'merged',
  );
  assert.equal(
    classifyMembership(
      mergedMidRun(),
      expected,
      pullRequest({ state: 'open', merged: false }),
    ),
    'open',
  );
});

test('a listed foreign pull request is never rescued by pull request evidence', () => {
  assert.throws(
    () =>
      validateRun(
        run({
          pull_requests: [
            {
              number: 43,
              head: { sha: head },
              base: {
                repo: { url: `https://api.github.com/repos/${repository}` },
              },
            },
          ],
        }),
        expected,
        pullRequest(),
      ),
    /expected #42@bbbbbbbbbbbb, run lists #43@bbbbbbbbbbbb/,
  );
});

for (const [label, pull, message] of [
  [
    'another pull request number',
    pullRequest({ number: 43 }),
    /reports #43@bbbbbbbbbbbb/,
  ],
  [
    'a moved head',
    pullRequest({ head: { sha: 'c'.repeat(40) } }),
    /expected #42@bbbbbbbbbbbb, pull request reports #42@cccccccccccc/,
  ],
  [
    'another base repository',
    pullRequest({ base: { repo: { full_name: 'other/repo' } } }),
    /does not match/,
  ],
  [
    'closed without merging',
    pullRequest({ state: 'closed', merged: false }),
    /closed without merging/,
  ],
  ['no pull request body', null, /Invalid metadata response/],
  ['a non-object body', 'merged', /Invalid metadata response/],
]) {
  test(`fails closed for an empty membership list with ${label}`, async () => {
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...reader({ metadata: mergedMidRun(), pull }),
        sleep: async (ms) => delays.push(ms),
      }),
      message,
    );
    assert.deepEqual(delays, []);
  });
}

test('mismatch reports contain only numbers and short heads', async () => {
  await assert.rejects(
    qualifyVerdict(expected, {
      ...reader({
        metadata: mergedMidRun(),
        pull: pullRequest({
          head: { sha: 'c'.repeat(40) },
          title: 'fixture-secret',
        }),
      }),
      get: async (route) => ({
        status: 200,
        body: route.includes('/pulls/')
          ? pullRequest({
              head: { sha: 'c'.repeat(40) },
              title: 'fixture-secret',
            })
          : mergedMidRun(),
      }),
    }),
    (error) => {
      assert.doesNotMatch(error.message, /fixture-secret|c{13}/);
      return true;
    },
  );
});

test('pull request read retries transient responses like run reads', async () => {
  const api = reader({ metadata: mergedMidRun() });
  const delays = [];
  let failed = false;
  const get = async (...args) => {
    if (args[0].includes('/pulls/') && !failed) {
      failed = true;
      return { status: 404, body: {} };
    }
    return api.get(...args);
  };
  assert.equal(
    (
      await qualifyVerdict(expected, {
        get,
        sleep: async (ms) => delays.push(ms),
      })
    ).id,
    11,
  );
  assert.deepEqual(delays, [2_000]);
});

test('CLI sends the token only to the current run and the named pull request', async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    const body = url.includes('/jobs?')
      ? { total_count: 1, jobs: [job()] }
      : url.includes('/pulls/')
        ? pullRequest()
        : mergedMidRun();
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    await main({ ...env, GH_TOKEN: 'fixture-token' });
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(
    urls.includes(`https://api.github.com/repos/${repository}/pulls/42`),
  );
  assert.ok(
    urls.every(
      (url) =>
        url.startsWith(
          `https://api.github.com/repos/${repository}/actions/runs/123`,
        ) || url === `https://api.github.com/repos/${repository}/pulls/42`,
    ),
  );
});

test('non-PR events never read a pull request route', async () => {
  const identity = expectedIdentity({ ...env, EXPECTED_EVENT: 'push' });
  const api = reader({
    metadata: run({ event: 'push', head_sha: source, pull_requests: [] }),
    jobs: [job({ head_sha: source })],
  });
  assert.equal((await qualifyVerdict(identity, api)).id, 11);
  assert.ok(api.calls.every((call) => !call.route.includes('/pulls/')));
});

test('reads all numbered pages including a real match after page one', async () => {
  const jobs = Array.from({ length: 201 }, (_, i) =>
    job({ id: i + 100, name: `Worker ${i}` }),
  );
  jobs[200] = job({ id: 999 });
  const api = reader({ jobs });
  assert.equal((await qualifyVerdict(expected, api)).id, 999);
  assert.equal(
    api.calls.filter((call) => call.route.includes('/jobs?')).length,
    3,
  );
});
for (const [label, transform] of [
  [
    'inconsistent count',
    (body, page) => ({
      ...body,
      total_count: body.total_count + (page === 2 ? 1 : 0),
    }),
  ],
  ['missing page rows', (body) => ({ ...body, jobs: [] })],
  ['oversize total', (body) => ({ ...body, total_count: 10_001 })],
  ['negative total', (body) => ({ ...body, total_count: -1 })],
  ['noninteger total', (body) => ({ ...body, total_count: 1.5 })],
]) {
  test(`rejects pagination ${label}`, async () => {
    const jobs = Array.from({ length: 101 }, (_, i) =>
      job({ id: i + 1, name: i ? `Worker ${i}` : expected.jobName }),
    );
    await assert.rejects(
      qualifyVerdict(expected, reader({ jobs, pageTransform: transform })),
    );
  });
}
test('rejects duplicate IDs across pages', async () => {
  const jobs = Array.from({ length: 101 }, (_, i) =>
    job({
      id: i === 100 ? 1 : i + 1,
      name: i ? `Worker ${i}` : expected.jobName,
    }),
  );
  await assert.rejects(qualifyVerdict(expected, reader({ jobs })), /duplicate/);
});
for (const status of [404, 408, 429, 500, 503, 599]) {
  test(`retries only a complete snapshot after transient ${status}`, async () => {
    const api = reader({ replies: [{ status, body: {} }] });
    const delays = [];
    await qualifyVerdict(expected, {
      ...api,
      sleep: async (ms) => delays.push(ms),
    });
    assert.deepEqual(delays, [2_000]);
    assert.equal(api.calls[0].route, api.calls[1].route);
  });
}
for (const status of [301, 400, 401, 403, 422]) {
  test(`permanent response ${status} never retries`, async () => {
    const api = reader({ replies: [{ status, body: {} }] });
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...api,
        sleep: async (ms) => delays.push(ms),
      }),
    );
    assert.deepEqual(delays, []);
    assert.equal(api.calls.length, 1);
  });
}
test('at most three snapshots with two then five second waits', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(
    qualifyVerdict(expected, {
      get: async () => {
        calls++;
        return { status: 503, body: {} };
      },
      sleep: async (ms) => delays.push(ms),
    }),
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2_000, 5_000]);
});
test('completed-helper absence retries without fabricating success', async () => {
  let snapshots = 0;
  const api = reader();
  const get = async (...args) => {
    const response = await api.get(...args);
    if (args[0].includes('/jobs?') && snapshots++ < 2)
      return { status: 200, body: { total_count: 0, jobs: [] } };
    return response;
  };
  const delays = [];
  await qualifyVerdict(expected, { get, sleep: async (ms) => delays.push(ms) });
  assert.deepEqual(delays, [2_000, 5_000]);
});
for (const status of ['queued', 'in_progress']) {
  test(`matched ${status} verdict retries a complete snapshot before genuine success`, async () => {
    const api = reader();
    const delays = [];
    let snapshots = 0;
    const get = async (...args) => {
      const response = await api.get(...args);
      if (args[0].includes('/jobs?') && snapshots++ === 0)
        response.body.jobs = [job({ status, conclusion: null })];
      return response;
    };
    assert.equal(
      (
        await qualifyVerdict(expected, {
          get,
          sleep: async (ms) => delays.push(ms),
        })
      ).id,
      11,
    );
    assert.deepEqual(delays, [2_000]);
    assert.equal(
      api.calls.filter((call) => call.route.includes('/jobs?')).length,
      2,
    );
    assert.equal(
      api.calls.filter((call) => call.route.endsWith('/123')).length,
      3,
    );
  });
  test(`matched ${status} verdict exhausts the existing propagation budget without success`, async () => {
    const api = reader({ jobs: [job({ status, conclusion: null })] });
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...api,
        sleep: async (ms) => delays.push(ms),
      }),
      /not completed/,
    );
    assert.deepEqual(delays, [2_000, 5_000]);
    assert.equal(
      api.calls.filter((call) => call.route.includes('/jobs?')).length,
      3,
    );
    assert.equal(
      api.calls.filter((call) => call.route.endsWith('/123')).length,
      3,
    );
  });
}

test('nonfinal classification never retries malformed states or completed failures', async () => {
  const overrides = [
    ...[
      null,
      '',
      'failure',
      'cancelled',
      'skipped',
      'neutral',
      'timed_out',
      'success',
    ]
      .map((conclusion) => ({ status: 'completed', conclusion }))
      .filter((value) => value.conclusion !== 'success'),
    ...['queued', 'in_progress'].flatMap((status) =>
      [undefined, '', 'success', 'failure', 'cancelled'].map((conclusion) => ({
        status,
        conclusion,
      })),
    ),
    ...[undefined, null, '', 'waiting', 'pending', 'requested', 'unknown'].map(
      (status) => ({ status, conclusion: null }),
    ),
  ];
  for (const override of overrides) {
    const api = reader({ jobs: [job(override)] });
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...api,
        sleep: async (ms) => delays.push(ms),
      }),
    );
    assert.deepEqual(delays, []);
    assert.equal(api.calls.length, 2);
  }
});

test('pending verdicts cannot retry before complete run and job identity validation', async () => {
  const pending = job({ status: 'in_progress', conclusion: null });
  const cases = [
    ...[
      { id: 124 },
      { run_attempt: 1 },
      { event: 'push' },
      { path: '.github/workflows/fake.yml' },
      { workflow_id: 1 },
      { repository: { full_name: 'other/repo' } },
      { head_sha: 'c'.repeat(40) },
      { referenced_workflows: [] },
    ].map((override) => ({
      metadata: run(override),
      jobs: [pending],
      reads: 1,
    })),
    ...[
      { id: 0 },
      { run_id: 124 },
      { run_attempt: 1 },
      { head_sha: source },
    ].map((override) => ({ jobs: [{ ...pending, ...override }], reads: 2 })),
    { jobs: [pending, { ...pending, id: 12 }], reads: 2 },
    { jobs: [pending, { ...pending, name: 'Plan' }], reads: 2 },
  ];
  for (const { reads, ...fixture } of cases) {
    const api = reader(fixture);
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...api,
        sleep: async (ms) => delays.push(ms),
      }),
    );
    assert.deepEqual(delays, []);
    assert.equal(api.calls.length, reads);
  }
});

test('attempt or source change during final reread fails immediately', async () => {
  for (const finalRun of [
    run({ run_attempt: 3 }),
    run({ head_sha: source }),
    run({ referenced_workflows: [] }),
  ]) {
    const delays = [];
    await assert.rejects(
      qualifyVerdict(expected, {
        ...reader({ finalRun }),
        sleep: async (ms) => delays.push(ms),
      }),
    );
    assert.deepEqual(delays, []);
  }
});
test('monotonic deadline prevents work and retries outside budget', async () => {
  await assert.rejects(
    qualifyVerdict(expected, { ...reader(), now: () => 10, deadline: 10 }),
    /deadline/,
  );
  const api = reader({ replies: [{ status: 503, body: {} }] });
  const delays = [];
  await assert.rejects(
    qualifyVerdict(expected, {
      ...api,
      now: () => 0,
      deadline: 1_000,
      sleep: async (ms) => delays.push(ms),
    }),
    /deadline/,
  );
  assert.deepEqual(delays, []);
});
test('unexpected external next page cannot receive authorization', async () => {
  const api = reader();
  await assert.rejects(
    qualifyVerdict(expected, {
      get: async (...args) => {
        const response = await api.get(...args);
        if (args[0].includes('/jobs?'))
          response.headers = new Headers({
            link: '<https://evil.example/token>; rel="next"',
          });
        return response;
      },
    }),
    /next-page/,
  );
});

test('CLI metadata transport uses only fixed own-attempt GET routes and keeps the token on api.github.com', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const body = url.includes('/jobs?')
      ? { total_count: 1, jobs: [job()] }
      : run();
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    await main({ ...env, GH_TOKEN: 'fixture-token' });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls.length, 3);
  for (const { url, options } of calls) {
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.ok(
      url.startsWith(
        'https://api.github.com/repos/genfeedai/genfeed.ai/actions/runs/123',
      ),
    );
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('CLI rejects hostile context and permanent transport errors without token destinations or retry', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('fixture transport failure');
  };
  try {
    await assert.rejects(
      main({
        ...env,
        GH_TOKEN: 'fixture-token',
        GITHUB_REPOSITORY: 'https://evil.example',
      }),
    );
    assert.equal(calls, 0);
    await assert.rejects(main({ ...env, GH_TOKEN: '' }), /token/);
    assert.equal(calls, 0);
    await assert.rejects(
      main({ ...env, GH_TOKEN: 'fixture-token' }),
      /transport/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

for (const link of [
  '<https://api.github.com/repos/genfeedai/genfeed.ai/actions/runs/123/attempts/2/jobs?per_page=100&page=2>; rel=next',
  '<https://evil.example/token>; rel="NEXT"',
  '<https://evil.example/token>; rel="next"; ignored="extra"',
  '<https://evil.example/token>; rel="next", <https://evil.example/token>; rel="next"',
]) {
  test(`rejects unexpected pagination header shape ${link}`, async () => {
    const api = reader();
    await assert.rejects(
      qualifyVerdict(expected, {
        get: async (...args) => {
          const response = await api.get(...args);
          if (args[0].includes('/jobs?'))
            response.headers = new Headers({ link });
          return response;
        },
      }),
      /pagination|next-page/,
    );
  });
}

test('pagination transient restarts from run identity and rereads all pages', async () => {
  const jobs = Array.from({ length: 101 }, (_, i) =>
    job({ id: i + 1, name: i === 100 ? expected.jobName : `Worker ${i}` }),
  );
  const api = reader({ jobs });
  let failed = false;
  const get = async (...args) => {
    if (args[0].endsWith('page=2') && !failed) {
      failed = true;
      return { status: 503, body: {} };
    }
    return api.get(...args);
  };
  const delays = [];
  assert.equal(
    (
      await qualifyVerdict(expected, {
        get,
        sleep: async (ms) => delays.push(ms),
      })
    ).id,
    101,
  );
  assert.deepEqual(delays, [2_000]);
  assert.equal(
    api.calls.filter((call) => call.route.endsWith('page=1')).length,
    2,
  );
  assert.equal(
    api.calls.filter((call) => call.route.endsWith('/123')).length,
    3,
  );
});
