import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrTestPlan } from './pr-test-plan.mjs';
import {
  awaitPlanOutputs,
  buildPlanOutputs,
  findIdleLegs,
  mayHaveWork,
  PLAN_OUTPUT_NAMES,
  pickPlanArtifact,
  planArtifactName,
  plannedLegs,
  resolveDiffBase,
  resolveLeg,
} from './test-plan-handoff.mjs';

const BASE = 'a'.repeat(40);

function outputsFor(planInput) {
  return buildPlanOutputs({
    plan: createPrTestPlan({ base: BASE, ...planInput }),
    base: BASE,
    heavy: 'false',
    specRun: 'true',
    specWorkspaces: 'web',
    specBuildFilters: '',
  });
}

test('publishes every output the Plan job declares, as strings', () => {
  const outputs = outputsFor({
    changedFiles: ['apps/web/src/a.ts'],
    appTests: ['apps/web/src/a.spec.ts'],
  });

  assert.deepEqual(Object.keys(outputs), PLAN_OUTPUT_NAMES);
  for (const value of Object.values(outputs)) {
    assert.equal(typeof value, 'string');
  }
  assert.equal(outputs.app_tests, 'true');
  assert.equal(outputs.api_tests, 'false');
  assert.equal(outputs.base, BASE);
});

test('an app job runs the plan shard that carries its number', () => {
  const outputs = outputsFor({
    changedFiles: ['apps/web/src/a.ts'],
    appTests: Array.from(
      { length: 100 },
      (_, i) => `apps/web/src/f${i}.spec.ts`,
    ),
  });

  const first = resolveLeg({ kind: 'app', slot: '1', outputs });
  const second = resolveLeg({ kind: 'app', slot: '2', outputs });
  const third = resolveLeg({ kind: 'app', slot: '3', outputs });

  assert.equal(first.run, true);
  assert.equal(first.leg.shard, 1);
  assert.equal(first.leg.total, 2);
  assert.equal(first.leg.count + second.leg.count, 100);
  assert.deepEqual(third, { run: false, leg: null });
});

test('a surface the plan does not run gives every job of it nothing', () => {
  const outputs = outputsFor({ changedFiles: ['docs/readme.md'] });

  for (const slot of ['1', '2', '3', '4']) {
    assert.equal(resolveLeg({ kind: 'app', slot, outputs }).run, false);
  }
  for (let shard = 1; shard <= 8; shard += 1) {
    assert.equal(
      resolveLeg({ kind: 'api', slot: String(shard), outputs }).run,
      false,
    );
  }
});

test('workspace jobs take the plan pools by number and the server leg by name', () => {
  const outputs = outputsFor({
    changedFiles: ['apps/server/workers/src/a.ts'],
    turboTasks: { server: ['@genfeedai/workers#test'] },
  });

  const pool = resolveLeg({ kind: 'workspaces', slot: '1', outputs });
  const server = resolveLeg({ kind: 'workspaces', slot: 'server', outputs });
  const secondPool = resolveLeg({ kind: 'workspaces', slot: '2', outputs });

  assert.equal(server.run, true);
  assert.equal(server.leg.group, 'server');
  assert.equal(pool.run, false);
  assert.equal(secondPool.run, false);
});

test('the full tier plans exactly the jobs the release evidence names', () => {
  // scripts/ci/release-changelog.test.mjs lists these names for the Full Suite.
  const outputs = outputsFor({
    changedFiles: ['bun.lock'],
    runHeavy: true,
    forceAllSurfaces: true,
  });

  assert.deepEqual(
    plannedLegs(outputs).map((leg) => leg.job),
    [
      'Test App (shard 1/4)',
      'Test App (shard 2/4)',
      'Test App (shard 3/4)',
      'Test App (shard 4/4)',
      'Test API (shard 1/8)',
      'Test API (shard 2/8)',
      'Test API (shard 3/8)',
      'Test API (shard 4/8)',
      'Test API (shard 5/8)',
      'Test API (shard 6/8)',
      'Test API (shard 7/8)',
      'Test API (shard 8/8)',
      'Test Workspaces (workspaces-1/4)',
      'Test Workspaces (workspaces-2/4)',
      'Test Workspaces (workspaces-3/4)',
      'Test Workspaces (workspaces-4/4)',
      'Test Workspaces (server)',
      'Spec Typecheck',
      'Build',
      'Cloud Tenant Guard Sweep',
      'MCP Auth Runtime',
    ],
  );
});

test('rejects a matrix it cannot read instead of running nothing', () => {
  assert.throws(
    () =>
      resolveLeg({
        kind: 'app',
        slot: '1',
        outputs: { app_tests: 'true', app_matrix: '{not json' },
      }),
    /app_matrix is not valid JSON/,
  );
  assert.throws(
    () =>
      resolveLeg({
        kind: 'api',
        slot: '1',
        outputs: { api_tests: 'true', api_matrix: '{"shards":[]}' },
      }),
    /api_matrix must hold an include list/,
  );
});

const preflightCases = [
  {
    name: 'a docs change leaves the app jobs nothing',
    input: { kind: 'app', slot: '1', changedFiles: ['docs/a.md'] },
    expected: false,
  },
  {
    name: 'a web change gives the app jobs work',
    input: { kind: 'app', slot: '4', changedFiles: ['apps/web/src/a.ts'] },
    expected: true,
  },
  {
    name: 'a web change leaves the API jobs nothing',
    input: { kind: 'api', slot: '1', changedFiles: ['apps/web/src/a.ts'] },
    expected: false,
  },
  {
    name: 'an API change can use four shards',
    input: {
      kind: 'api',
      slot: '4',
      changedFiles: ['apps/server/api/src/a.ts'],
    },
    expected: true,
  },
  {
    name: 'an API change never plans a fifth shard',
    input: {
      kind: 'api',
      slot: '5',
      changedFiles: ['apps/server/api/src/a.ts'],
    },
    expected: false,
  },
  {
    name: 'the full tier plans all eight API shards',
    input: {
      kind: 'api',
      slot: '8',
      changedFiles: ['apps/server/api/src/a.ts'],
      isHeavy: true,
    },
    expected: true,
  },
  {
    name: 'a lockfile change escalates to the full tier',
    input: { kind: 'api', slot: '8', changedFiles: ['bun.lock'] },
    expected: true,
  },
  {
    name: 'a run without a diff base runs every surface',
    input: { kind: 'app', slot: '1', changedFiles: [], isChangeRun: false },
    expected: true,
  },
  {
    name: 'an apps-only change cannot fill a second workspace pool',
    input: {
      kind: 'workspaces',
      slot: '2',
      changedFiles: ['apps/web/src/a.ts', '.agents/memory/a.md'],
    },
    expected: false,
  },
  {
    name: 'a package change can fill a second workspace pool',
    input: {
      kind: 'workspaces',
      slot: '2',
      changedFiles: ['packages/contracts/src/a.ts'],
    },
    expected: true,
  },
  {
    name: 'a root file can reach every package through turbo',
    input: { kind: 'workspaces', slot: '3', changedFiles: ['.env.example'] },
    expected: true,
  },
  {
    name: 'the first pool and the server leg always stay',
    input: { kind: 'workspaces', slot: 'server', changedFiles: ['docs/a.md'] },
    expected: true,
  },
];

for (const { name, input, expected } of preflightCases) {
  test(`preflight: ${name}`, () => {
    assert.equal(
      mayHaveWork({ isChangeRun: true, isHeavy: false, ...input }),
      expected,
    );
  });
}

test('preflight rules out nothing the planner would give a job', () => {
  // The preflight and the planner classify with the same functions. This pins
  // that no changed-file set the preflight rules out reaches a planned job.
  const changeSets = [
    ['docs/a.md'],
    ['apps/web/src/a.ts'],
    ['apps/server/api/src/a.ts'],
    ['apps/server/workers/src/a.ts'],
    ['packages/contracts/src/a.ts'],
    ['.github/workflows/ci.yml'],
    ['bun.lock'],
    ['.env.example'],
  ];
  for (const changedFiles of changeSets) {
    const outputs = outputsFor({
      changedFiles,
      appTests: changedFiles.some(
        (file) => file.startsWith('apps/web/') || file.startsWith('packages/'),
      )
        ? ['apps/web/src/a.spec.ts']
        : [],
      apiTests: changedFiles.some(
        (file) =>
          file.startsWith('apps/server/api/') || file.startsWith('packages/'),
      )
        ? ['apps/server/api/src/a.spec.ts']
        : [],
    });
    const planned = new Set(plannedLegs(outputs).map((leg) => leg.job));
    for (let shard = 1; shard <= 4; shard += 1) {
      if (planned.has(`Test App (shard ${shard}/4)`)) {
        assert.equal(
          mayHaveWork({
            kind: 'app',
            slot: String(shard),
            changedFiles,
            isChangeRun: true,
            isHeavy: false,
          }),
          true,
          `${changedFiles} plans app shard ${shard}`,
        );
      }
    }
    for (let shard = 1; shard <= 8; shard += 1) {
      if (planned.has(`Test API (shard ${shard}/8)`)) {
        assert.equal(
          mayHaveWork({
            kind: 'api',
            slot: String(shard),
            changedFiles,
            isChangeRun: true,
            isHeavy: false,
          }),
          true,
          `${changedFiles} plans API shard ${shard}`,
        );
      }
    }
  }
});

test('reads the diff base the way the Plan job resolves it', () => {
  const git = (args) => {
    assert.deepEqual(args.slice(0, 2), ['rev-parse', 'HEAD^1']);
    return BASE;
  };

  assert.equal(resolveDiffBase({ EVENT_NAME: 'pull_request' }, git), BASE);
  assert.equal(resolveDiffBase({ EVENT_NAME: 'workflow_dispatch' }, git), '');
  assert.throws(
    () =>
      resolveDiffBase({
        EVENT_NAME: 'merge_group',
        MERGE_GROUP_BASE_SHA: 'main',
      }),
    /Invalid merge group base SHA/,
  );
  const checked = [];
  assert.equal(
    resolveDiffBase(
      { EVENT_NAME: 'merge_group', MERGE_GROUP_BASE_SHA: BASE },
      (args) => checked.push(args) && '',
    ),
    BASE,
  );
  assert.deepEqual(checked, [['merge-base', '--is-ancestor', BASE, 'HEAD']]);
});

const artifact = (attempt, extra = {}) => ({
  name: planArtifactName(attempt),
  expired: false,
  archive_download_url: `https://api.example/${attempt}`,
  ...extra,
});

test('a job re-run on its own reads the plan of the attempt that planned', () => {
  assert.equal(pickPlanArtifact([], 1), null);
  assert.equal(pickPlanArtifact([artifact(1)], 2).name, 'test-plan-outputs-1');
  assert.equal(
    pickPlanArtifact([artifact(1), artifact(2)], 2).name,
    'test-plan-outputs-2',
  );
  // A plan from a later attempt than this job's is not this job's.
  assert.equal(pickPlanArtifact([artifact(3)], 2), null);
  assert.equal(pickPlanArtifact([artifact(1, { expired: true })], 1), null);
  assert.equal(
    pickPlanArtifact([{ name: 'api-test-timings-1', expired: false }], 1),
    null,
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    json: async () => body,
  };
}

test('waits for the Plan job, then returns its outputs', async () => {
  const lists = [[], [], [artifact(1)]];
  const waits = [];
  const outputs = await awaitPlanOutputs({
    repository: 'o/r',
    runId: '7',
    attempt: 1,
    token: 't',
    fetchImpl: async () => jsonResponse({ artifacts: lists.shift() }),
    download: async () => ({ ok: true, outputs: { app_tests: 'true' } }),
    wait: async (ms) => waits.push(ms),
  });

  assert.deepEqual(outputs, { app_tests: 'true' });
  assert.equal(waits.length, 2);
});

test('polls again while a listed plan artifact is not downloadable yet', async () => {
  const failures = [404, 404, 503];
  const waits = [];
  const outputs = await awaitPlanOutputs({
    repository: 'o/r',
    runId: '7',
    attempt: 1,
    token: 't',
    fetchImpl: async () => jsonResponse({ artifacts: [artifact(1)] }),
    download: async () => {
      const status = failures.shift();
      if (status) {
        throw Object.assign(new Error(`HTTP ${status}`), { status });
      }
      return { ok: true, outputs: { app_tests: 'true' } };
    },
    wait: async (ms) => waits.push(ms),
  });

  assert.deepEqual(outputs, { app_tests: 'true' });
  assert.equal(waits.length, 3);
});

test('a plan artifact that is refused for good fails the job', async () => {
  await assert.rejects(
    awaitPlanOutputs({
      repository: 'o/r',
      runId: '7',
      attempt: 1,
      token: 't',
      fetchImpl: async () => jsonResponse({ artifacts: [artifact(1)] }),
      download: async () => {
        throw Object.assign(new Error('HTTP 403'), { status: 403 });
      },
      wait: async () => {},
    }),
    /HTTP 403/,
  );
});

test('a failed Plan job fails the jobs waiting on it at once', async () => {
  await assert.rejects(
    awaitPlanOutputs({
      repository: 'o/r',
      runId: '7',
      attempt: 1,
      token: 't',
      fetchImpl: async () => jsonResponse({ artifacts: [artifact(1)] }),
      download: async () => ({ ok: false }),
      wait: async () => {},
    }),
    /The Plan job failed/,
  );
});

test('gives up when the Plan job never publishes', async () => {
  let clock = 0;
  await assert.rejects(
    awaitPlanOutputs({
      repository: 'o/r',
      runId: '7',
      attempt: 1,
      token: 't',
      fetchImpl: async () => jsonResponse({ artifacts: [] }),
      wait: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      timeoutMs: 20_000,
    }),
    /Timed out waiting for the Plan job/,
  );
});

test('polls with a conditional request so an unchanged list costs nothing', async () => {
  const seen = [];
  const lists = [[], [artifact(1)]];
  await awaitPlanOutputs({
    repository: 'o/r',
    runId: '7',
    attempt: 1,
    token: 't',
    fetchImpl: async (_url, init) => {
      seen.push(init.headers['If-None-Match'] ?? null);
      if (seen.length === 2) {
        return {
          ok: false,
          status: 304,
          headers: new Map(),
          json: async () => ({}),
        };
      }
      const response = jsonResponse({ artifacts: lists.shift() });
      response.headers = new Map([['etag', `"v${seen.length}"`]]);
      return response;
    },
    download: async () => ({ ok: true, outputs: {} }),
    wait: async () => {},
  });

  assert.deepEqual(seen, [null, '"v1"', '"v1"']);
});

test('a planned job whose work step never ran fails the verdict', () => {
  const legs = [
    { job: 'Test App (shard 1/4)', step: 'Run app tests' },
    { job: 'Test API (shard 1/8)', step: 'Run API tests' },
    { job: 'Test API (shard 2/8)', step: 'Run API tests' },
  ];
  const jobs = [
    {
      name: 'Core Validation / Test App (shard 1/4)',
      steps: [{ name: 'Run app tests', conclusion: 'success' }],
    },
    {
      name: 'Core Validation / Test API (shard 1/8)',
      steps: [{ name: 'Run API tests', conclusion: 'skipped' }],
    },
  ];

  assert.deepEqual(findIdleLegs(jobs, legs), [
    'Test API (shard 1/8): the plan called for it but "Run API tests" skipped',
    'Test API (shard 2/8): expected one job in this run, found 0',
  ]);
});

test('a work step that failed is left to the verdict, not reported as idle', () => {
  const jobs = [
    {
      name: 'Core Validation / Test App (shard 1/4)',
      steps: [{ name: 'Run app tests', conclusion: 'failure' }],
    },
  ];

  assert.deepEqual(
    findIdleLegs(jobs, [
      { job: 'Test App (shard 1/4)', step: 'Run app tests' },
    ]),
    [],
  );
});
