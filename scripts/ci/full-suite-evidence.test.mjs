import assert from 'node:assert/strict';
import test from 'node:test';

import {
  paginatedCollection,
  resolveFullSuiteEvidence,
  runCli,
  selectFullSuiteRun,
} from './full-suite-evidence.mjs';

const RELEASE_SHA = '9aa1d2ef5a829b8688e3aebcb830609f40f00d12';

function run(overrides = {}) {
  return {
    id: 33504809990,
    run_attempt: 1,
    created_at: '2026-09-01T11:53:47Z',
    event: 'push',
    head_branch: 'master',
    head_sha: RELEASE_SHA,
    html_url:
      'https://github.com/genfeedai/genfeed.ai/actions/runs/33504809990',
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

function gate(overrides = {}) {
  return {
    id: 900,
    name: 'Final Connected Acceptance',
    run_id: 33504809990,
    head_sha: RELEASE_SHA,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

function harness(overrides = {}) {
  const options = {
    releaseSha: RELEASE_SHA,
    listRuns: async () => [],
    listJobs: async (id) => [gate({ run_id: id })],
    sleep: async () => {},
    discoveryAttempts: 1,
    pollAttempts: 3,
    ...overrides,
  };
  let latestRuns = [];
  const listRuns = options.listRuns;
  options.listRuns = async (...args) => {
    latestRuns = await listRuns(...args);
    return latestRuns;
  };
  options.getRun ??= async (id) => latestRuns.find((item) => item.id === id);
  return options;
}

test('selects only exact-SHA master push or manual Full Suite evidence', () => {
  const selected = selectFullSuiteRun(
    [
      run({ id: 1, head_sha: 'a'.repeat(40) }),
      run({ id: 2, head_branch: 'feature' }),
      run({ id: 3, event: 'workflow_call' }),
      run({ id: 5, event: 'schedule', created_at: '2026-09-02T00:00:00Z' }),
      run({ id: 4, event: 'workflow_dispatch' }),
    ],
    RELEASE_SHA,
  );

  assert.equal(selected?.id, 4);
});

test('a cancelled run never hides an earlier failure for the same SHA', () => {
  const selected = selectFullSuiteRun(
    [
      run({ id: 1, conclusion: 'failure' }),
      run({
        id: 2,
        conclusion: 'cancelled',
        created_at: '2026-09-01T12:53:47Z',
      }),
    ],
    RELEASE_SHA,
  );

  assert.equal(selected?.id, 1);
});

test('a newer completed failure blocks older qualified green evidence', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ id: 1 }),
          run({
            id: 2,
            conclusion: 'failure',
            created_at: '2026-09-01T12:53:47Z',
          }),
        ],
      }),
    ),
    /concluded failure/,
  );
});

test('a newer qualified success supersedes an earlier failure', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [
        run({ id: 1, conclusion: 'failure' }),
        run({ id: 2, created_at: '2026-09-01T12:53:47Z' }),
      ],
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.id, 2);
});

test('rerun verdict ordering uses attempt start rather than run creation', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ id: 1, created_at: '2026-09-02T11:00:00Z' }),
          run({
            id: 2,
            run_attempt: 2,
            conclusion: 'failure',
            run_started_at: '2026-09-03T11:00:00Z',
          }),
        ],
      }),
    ),
    /concluded failure/,
  );
});

for (const status of ['in_progress', 'completed']) {
  test(`${status} rerun cannot hide a prior failed attempt behind another green run`, async () => {
    await assert.rejects(
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [
            run({ id: 1 }),
            run({
              id: 2,
              run_attempt: 3,
              status,
              conclusion: status === 'completed' ? 'cancelled' : null,
            }),
          ],
          getAttempt: async (id, attempt) =>
            run({
              id,
              run_attempt: attempt,
              conclusion: attempt === 2 ? 'cancelled' : 'failure',
              run_started_at: '2026-09-02T11:00:00Z',
            }),
        }),
      ),
      /concluded failure/,
    );
  });
}

test('a cancelled rerun can reuse its prior qualified successful attempt', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [run({ run_attempt: 2, conclusion: 'cancelled' })],
      getAttempt: async () => run(),
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.run_attempt, 1);
});

test('cancelled rerun job failures still block its prior green attempt', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ run_attempt: 2, conclusion: 'cancelled' }),
        ],
        getAttempt: async () => run(),
        listJobs: async (_id, attempt) =>
          attempt === 2 ? [gate({ conclusion: 'failure' })] : [gate()],
      }),
    ),
    /Final Connected Acceptance concluded failure/,
  );
});

test('a newer green supersedes an older cancelled attempt with failed jobs', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [
        run({ id: 1, conclusion: 'cancelled' }),
        run({ id: 2, created_at: '2026-09-02T11:00:00Z' }),
      ],
      listJobs: async (id) => [
        gate({ run_id: id, conclusion: id === 1 ? 'failure' : 'success' }),
      ],
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.id, 2);
});

test('a failed job in an intermediate cancelled attempt cannot hide behind old green', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ run_attempt: 3, status: 'in_progress', conclusion: null }),
        ],
        getAttempt: async (_id, attempt) =>
          run({
            run_attempt: attempt,
            conclusion: attempt === 2 ? 'cancelled' : 'success',
          }),
        listJobs: async (_id, attempt) => [
          gate({
            conclusion: attempt === 2 ? 'failure' : 'success',
          }),
        ],
      }),
    ),
    /Final Connected Acceptance concluded failure/,
  );
});

test('prior attempt recovery fails closed on wrong identity or unavailable history', async () => {
  for (const getAttempt of [
    async () => run({ head_sha: 'a'.repeat(40) }),
    async () => run({ run_attempt: 2 }),
    async () => {
      throw new Error('HTTP 500 attempts');
    },
  ]) {
    await assert.rejects(
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [
            run({ run_attempt: 2, status: 'in_progress', conclusion: null }),
          ],
          getAttempt,
        }),
      ),
      /identity|HTTP 500 attempts/,
    );
  }
});

test('a hard-red exact-SHA run blocks release even after a later cancel', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ id: 1, conclusion: 'failure' }),
          run({
            id: 2,
            conclusion: 'cancelled',
            created_at: '2026-09-01T12:53:47Z',
          }),
        ],
      }),
    ),
    /concluded failure/,
  );
});

test('prefers completed green evidence over an in-flight duplicate', () => {
  const selected = selectFullSuiteRun(
    [run({ id: 1 }), run({ id: 2, status: 'in_progress', conclusion: null })],
    RELEASE_SHA,
  );

  assert.equal(selected?.id, 1);
});

test('waits for an in-flight exact-SHA Full Suite and reuses it', async () => {
  const states = [run({ status: 'in_progress', conclusion: null }), run()];
  let polls = 0;
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [states[0]],
      getRun: async () => states[Math.min(++polls, states.length - 1)],
    }),
  );

  assert.equal(result.kind, 'verified');
  assert.equal(polls, 2);
});

test('allows a short discovery race before requesting fallback verification', async () => {
  let lookups = 0;
  const result = await resolveFullSuiteEvidence(
    harness({
      discoveryAttempts: 3,
      listRuns: async () => (++lookups === 3 ? [run()] : []),
    }),
  );

  assert.equal(result.kind, 'verified');
  assert.equal(lookups, 3);
});

test('falls back when no exact-SHA master run appears', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({ discoveryAttempts: 2 }),
  );

  assert.equal(result.kind, 'fallback');
  assert.match(result.reason, /No master Full Suite run appeared/);
});

test('falls back on API lookup failure instead of skipping verification', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => {
        throw new Error('HTTP 500');
      },
    }),
  );

  assert.equal(result.kind, 'fallback');
  assert.match(result.reason, /lookup failed.*HTTP 500/);
});

test('blocks release when the exact-SHA Full Suite fails', async () => {
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({ listRuns: async () => [run({ conclusion: 'failure' })] }),
      ),
    /repair the failed surface and release a new SHA/,
  );
});

test('distinguishes a cancelled failed run from a cancellation collision', async () => {
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [run({ conclusion: 'cancelled' })],
          listJobs: async () => [{ name: 'Test API', conclusion: 'failure' }],
        }),
      ),
    /Test API concluded failure/,
  );

  const collision = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [run({ conclusion: 'cancelled' })],
      listJobs: async () => [
        { name: 'Build & Boot Check', conclusion: 'cancelled' },
        { name: 'Tests Gate', conclusion: 'success' },
      ],
    }),
  );
  assert.equal(collision.kind, 'fallback');
  assert.match(collision.reason, /concluded cancelled/);
});

test('refuses to start a duplicate when an in-flight run never finishes', async () => {
  const active = run({ status: 'in_progress', conclusion: null });
  await assert.rejects(
    () =>
      resolveFullSuiteEvidence(
        harness({
          listRuns: async () => [active],
          getRun: async () => active,
          pollAttempts: 2,
        }),
      ),
    /refusing to start a duplicate run/,
  );
});

for (const [label, jobs] of [
  ['missing', []],
  ['skipped', [gate({ conclusion: 'skipped' })]],
  ['unfinished', [gate({ status: 'in_progress', conclusion: null })]],
  ['duplicate', [gate(), gate({ id: 901 })]],
  ['wrong SHA', [gate({ head_sha: 'a'.repeat(40) })]],
  ['wrong run', [gate({ run_id: 7 })]],
  ['wrong attempt', [gate({ run_attempt: 2 })]],
  ['prefixed name', [gate({ name: 'Other / Final Connected Acceptance' })]],
]) {
  test(`does not reuse overall green evidence with ${label} final connected gate`, async () => {
    const result = await resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [run()],
        listJobs: async () => jobs,
      }),
    );
    assert.equal(result.kind, 'fallback');
  });
}

test('unqualified green cannot mask a failed exact-SHA run', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ id: 1 }),
          run({ id: 2, conclusion: 'failure' }),
        ],
        listJobs: async () => [],
      }),
    ),
    /concluded failure/,
  );
});

test('qualified green is reused without waiting for an in-flight duplicate', async () => {
  let sleeps = 0;
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [
        run(),
        run({ id: 2, status: 'in_progress', conclusion: null }),
      ],
      sleep: async () => {
        sleeps += 1;
      },
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(sleeps, 0);
});

test('unqualified green does not hide an older qualified green', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [run({ id: 1 }), run({ id: 2 })],
      listJobs: async (id) => (id === 2 ? [gate({ run_id: id })] : []),
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.id, 2);
});

test('qualifies only jobs from the exact latest run attempt', async () => {
  const calls = [];
  const result = await resolveFullSuiteEvidence(
    harness({
      listRuns: async () => [run({ run_attempt: 3 })],
      listJobs: async (id, attempt) => {
        calls.push([id, attempt]);
        return [gate()];
      },
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.deepEqual(calls, [[run().id, 3]]);
});

test('refuses evidence that advances to a new attempt during qualification', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [run()],
        getRun: async () =>
          run({ run_attempt: 2, status: 'in_progress', conclusion: null }),
      }),
    ),
    /changed during qualification/,
  );
});

test('rejects failed connected jobs even under an inconsistent green conclusion', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [run()],
        listJobs: async () => [gate({ conclusion: 'failure' })],
      }),
    ),
    /Final Connected Acceptance concluded failure/,
  );
});

test('job lookup failure never verifies or launches a duplicate', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [run()],
        listJobs: async () => {
          throw new Error('HTTP 500 jobs');
        },
      }),
    ),
    /HTTP 500 jobs/,
  );
});

test('loss of visibility of an in-flight run cannot request a duplicate', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [
          run({ status: 'in_progress', conclusion: null }),
        ],
        getRun: async () => {
          throw new Error('HTTP 500');
        },
      }),
    ),
    /refusing to start a duplicate run/,
  );
});

test('collects the final connected gate after the first hundred jobs', () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
  const paths = [];
  const result = paginatedCollection(
    (path) => {
      paths.push(path);
      return { total_count: 101, jobs: paths.length === 1 ? first : [gate()] };
    },
    'repos/example/repo/actions/runs/1/attempts/3/jobs',
    'jobs',
  );
  assert.equal(result.length, 101);
  assert.equal(result.at(-1).name, 'Final Connected Acceptance');
  assert.deepEqual(paths, [
    'repos/example/repo/actions/runs/1/attempts/3/jobs?per_page=100&page=1',
    'repos/example/repo/actions/runs/1/attempts/3/jobs?per_page=100&page=2',
  ]);
});

test('pagination rejects duplicate, truncated, malformed and failed pages', () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
  let page = 0;
  assert.throws(
    () =>
      paginatedCollection(
        () => ({ total_count: 101, jobs: ++page === 1 ? first : [{ id: 1 }] }),
        'jobs',
        'jobs',
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      paginatedCollection(
        () => ({ total_count: 2, jobs: [{ id: 1 }] }),
        'jobs',
        'jobs',
      ),
    /incomplete/,
  );
  assert.throws(
    () => paginatedCollection(() => ({}), 'jobs', 'jobs'),
    /invalid/,
  );
  assert.throws(
    () =>
      paginatedCollection(
        () => {
          throw new Error('HTTP 500');
        },
        'jobs',
        'jobs',
      ),
    /HTTP 500/,
  );
});

test('shares a single wait budget across unqualified in-flight runs', async () => {
  const active = (id) => run({ id, status: 'in_progress', conclusion: null });
  let sleeps = 0;
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [active(1), active(2)],
        getRun: async (id) => (id === 1 ? run({ id }) : active(id)),
        listJobs: async () => [],
        pollAttempts: 2,
        sleep: async () => {
          sleeps += 1;
        },
      }),
    ),
    /refusing to start a duplicate run/,
  );
  assert.equal(sleeps, 1);
});

test('rejects changed run identity after inspecting connected evidence', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        listRuns: async () => [run()],
        getRun: async () => run({ head_sha: 'a'.repeat(40) }),
      }),
    ),
    /identity or attempt is invalid/,
  );
});

test('bounds pagination and rejects changing totals', () => {
  let page = 0;
  assert.throws(
    () =>
      paginatedCollection(
        () => {
          const offset = page++ * 100;
          return {
            total_count: 1001,
            jobs: Array.from({ length: 100 }, (_, index) => ({
              id: offset + index + 1,
            })),
          };
        },
        'jobs',
        'jobs',
      ),
    /bounded page limit/,
  );
  assert.equal(page, 10);
  page = 0;
  assert.throws(
    () =>
      paginatedCollection(
        () => ({
          total_count: ++page === 1 ? 101 : 102,
          jobs: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
        }),
        'jobs',
        'jobs',
      ),
    /changed during collection/,
  );
});

test('CLI reads paginated exact-SHA runs and only the latest attempt jobs', async () => {
  const requests = [];
  const outputs = [];
  const result = await runCli({
    env: {
      GITHUB_REPOSITORY: 'example/repo',
      RELEASE_SHA,
      GH_TOKEN: 'fixture',
      GITHUB_OUTPUT: 'fixture-output',
      GITHUB_RUN_ID: '123',
    },
    spawnSync: (command, args) => {
      assert.equal(command, 'gh');
      assert.equal(args[0], 'api');
      const path = args[1];
      requests.push(path);
      let body;
      if (path.includes('/workflows/full-suite.yml/runs?')) {
        body = { total_count: 1, workflow_runs: [run({ run_attempt: 4 })] };
      } else if (path.includes('/workflows/release.yml/runs?')) {
        body = { total_count: 0, workflow_runs: [] };
      } else if (path.endsWith('/attempts/4/jobs?per_page=100&page=1')) {
        body = { total_count: 1, jobs: [gate()] };
      } else {
        assert.equal(path, `repos/example/repo/actions/runs/${run().id}`);
        body = run({ run_attempt: 4 });
      }
      return { status: 0, stdout: JSON.stringify(body) };
    },
    appendFileSync: (path, text) => outputs.push([path, text]),
    sleep: async () => {},
    log: () => {},
    error: assert.fail,
  });
  assert.equal(result.kind, 'verified');
  assert.deepEqual(requests, [
    `repos/example/repo/actions/workflows/full-suite.yml/runs?head_sha=${RELEASE_SHA}&per_page=100&page=1`,
    `repos/example/repo/actions/workflows/release.yml/runs?head_sha=${RELEASE_SHA}&per_page=100&page=1`,
    `repos/example/repo/actions/runs/${run().id}/attempts/4/jobs?per_page=100&page=1`,
    `repos/example/repo/actions/runs/${run().id}`,
  ]);
  assert.deepEqual(outputs, [['fixture-output', 'suite_verified=true\n']]);
});

function releaseRun(overrides = {}) {
  return run({
    evidence_kind: 'release',
    workflow_id: 77,
    event: 'workflow_dispatch',
    ...overrides,
  });
}

test('reuses a prior successful normal Release with its nested final connected gate', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      currentRunId: 123,
      listRuns: async () => [releaseRun()],
      listJobs: async () => [
        gate({ name: 'Full Suite / Final Connected Acceptance' }),
      ],
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.evidence_kind, 'release');
});

for (const [label, overrides] of [
  ['current run', { id: 123 }],
  ['active', { status: 'in_progress', conclusion: null }],
  ['failed', { conclusion: 'failure' }],
  ['cancelled', { conclusion: 'cancelled' }],
  ['different SHA', { head_sha: 'a'.repeat(40) }],
  ['non-master', { head_branch: 'feature' }],
  ['wrong event', { event: 'workflow_call' }],
]) {
  test(`does not reuse or wait for ${label} Release evidence`, async () => {
    let inspected = 0;
    const result = await resolveFullSuiteEvidence(
      harness({
        currentRunId: 123,
        listRuns: async () => [releaseRun(overrides)],
        listJobs: async () => {
          inspected += 1;
          return [gate()];
        },
        sleep: async () => {
          assert.fail('Excluded Release must not be awaited');
        },
      }),
    );
    assert.equal(result.kind, 'fallback');
    assert.equal(inspected, 0);
  });
}

test('Release reuse requires a known current run identity for exclusion', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({ listRuns: async () => [releaseRun()] }),
  );
  assert.equal(result.kind, 'fallback');
});

for (const [label, jobs] of [
  ['recovery without normal fallback', []],
  [
    'skipped normal fallback',
    [
      gate({
        name: 'Full Suite / Final Connected Acceptance',
        conclusion: 'skipped',
      }),
    ],
  ],
  ['standalone name only', [gate()]],
  [
    'duplicate nested gate',
    [
      gate({ name: 'Full Suite / Final Connected Acceptance' }),
      gate({ id: 901, name: 'Full Suite / Final Connected Acceptance' }),
    ],
  ],
]) {
  test(`does not reuse Release evidence with ${label}`, async () => {
    const result = await resolveFullSuiteEvidence(
      harness({
        currentRunId: 123,
        listRuns: async () => [releaseRun()],
        listJobs: async () => jobs,
      }),
    );
    assert.equal(result.kind, 'fallback');
  });
}

test('qualified Release evidence can avoid repeating the nested fallback despite ordinary green Full Suite', async () => {
  const result = await resolveFullSuiteEvidence(
    harness({
      currentRunId: 123,
      listRuns: async () => [run({ id: 1 }), releaseRun({ id: 2 })],
      listJobs: async (id) =>
        id === 2
          ? [
              gate({
                run_id: 2,
                name: 'Full Suite / Final Connected Acceptance',
              }),
            ]
          : [],
    }),
  );
  assert.equal(result.kind, 'verified');
  assert.equal(result.run.id, 2);
});

test('unqualified Release green cannot conceal standalone connected failure', async () => {
  await assert.rejects(
    resolveFullSuiteEvidence(
      harness({
        currentRunId: 123,
        listRuns: async () => [
          releaseRun({ id: 1 }),
          run({ id: 2, conclusion: 'failure' }),
        ],
        listJobs: async () => [],
      }),
    ),
    /concluded failure/,
  );
});

test('rejects Release workflow identity or attempt changes during qualification', async () => {
  for (const changed of [
    releaseRun({ workflow_id: 88 }),
    releaseRun({ run_attempt: 2 }),
  ]) {
    await assert.rejects(
      resolveFullSuiteEvidence(
        harness({
          currentRunId: 123,
          listRuns: async () => [releaseRun()],
          listJobs: async () => [
            gate({ name: 'Full Suite / Final Connected Acceptance' }),
          ],
          getRun: async () => changed,
        }),
      ),
      /identity or attempt is invalid|changed during qualification/,
    );
  }
});
