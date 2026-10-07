import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  createApiObserver,
  DATABASE_QUERY,
  normalizeDatabaseRows,
  POOL_OPTIONS,
  validateObservationRecord,
} from './api-observer-core.mjs';

function fixture(options = {}) {
  let clock = 1000;
  const lines = [],
    timers = [];
  const pool = {
    query: async () => ({ rows: [] }),
    end: () => Promise.resolve(),
  };
  const instance = createApiObserver({
    write: (line) => lines.push(JSON.parse(line)),
    now: () => clock,
    setIntervalImpl: (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    clearIntervalImpl: () => {},
    pool,
    cpuUsage: () => ({ user: 0, system: 0 }),
    hrtime: () => 0n,
    ...options,
  });
  return {
    ...instance,
    lines,
    pool,
    tick: (n = 1) => {
      clock += n;
    },
    response: () =>
      Object.assign(new EventEmitter(), {
        statusCode: 200,
        headersSent: false,
      }),
  };
}
test('native lifecycle observes only canonical attempt header, distinct re-entry and every emission', () => {
  const f = fixture();
  const ignored = { headers: {} };
  f.observer.ingress(ignored, f.response());
  assert.equal(f.observer.pipelineEnter(ignored), undefined);
  const request = {
    headers: { 'x-genfeed-ci-attempt': '1', authorization: 'private-token' },
    url: '/private-id?query',
    body: 'private-body',
  };
  const response = f.response();
  f.observer.ingress(request, response);
  f.tick();
  const first = f.observer.pipelineEnter(request);
  f.observer.pipelineNext(request, first);
  f.observer.pipelineNext(request, first);
  f.observer.pipelineFinalize(request, first);
  const second = f.observer.pipelineEnter(request);
  f.observer.pipelineError(request, second, {
    name: 'PrismaClientKnownRequestError',
    message: 'private-error',
    stack: 'private-stack',
  });
  f.observer.pipelineFinalize(request, second);
  response.headersSent = true;
  response.emit('finish');
  response.emit('finish');
  response.emit('close');
  response.emit('close');
  f.stop();
  const footer = f.lines.at(-1);
  assert.equal(footer.unavailable, false);
  assert.equal(footer.ingress, 1);
  assert.equal(footer.pipelineEntries, 2);
  assert.equal(footer.finishes, 1);
  assert.equal(footer.closes, 1);
  assert.equal(f.lines.filter((r) => r.kind === 'pipelineNext').length, 2);
  assert.equal(
    f.lines.find((r) => r.kind === 'pipelineError').category,
    'database',
  );
  for (const value of [
    'private-token',
    'private-id',
    'private-body',
    'private-error',
    'private-stack',
    'query',
  ])
    assert.equal(JSON.stringify(f.lines).includes(value), false);
  for (const record of f.lines) {
    validateObservationRecord(record);
    assert.throws(() =>
      validateObservationRecord({ ...record, private: 'token' }),
    );
  }
});
test('invalid and duplicate attempts make observation unavailable without throwing into responses', () => {
  const f = fixture();
  for (const header of ['0', '01', '1, 2', ['1'], '9007199254740992'])
    f.observer.ingress(
      { headers: { 'x-genfeed-ci-attempt': header } },
      f.response(),
    );
  const request = { headers: { 'x-genfeed-ci-attempt': '1' } };
  f.observer.ingress(request, f.response());
  f.observer.ingress({ ...request }, f.response());
  f.stop();
  assert.equal(f.lines.at(-1).invalidSequences, 5);
  assert.equal(f.lines.at(-1).duplicateSequences, 1);
  assert.equal(f.lines.at(-1).unavailable, true);
});
test('close before headers never claims default success and categorized errors omit content', () => {
  const f = fixture();
  const r = { headers: { 'x-genfeed-ci-attempt': '1' } },
    response = f.response();
  f.observer.ingress(r, response);
  const e = f.observer.pipelineEnter(r);
  f.observer.pipelineError(r, e, {
    name: 'RequestTimeoutException',
    getStatus: () => 408,
    message: 'secret',
  });
  response.emit('close');
  f.stop();
  assert.equal(f.lines.find((x) => x.kind === 'close').status, null);
  assert.equal(
    f.lines.find((x) => x.kind === 'pipelineError').category,
    'timeout',
  );
});
test('capacity, write failure and timer shutdown stay observational', () => {
  for (const options of [
    { maxRecords: 2 },
    { maxBytes: 50 },
    {
      write() {
        throw new Error('private disk error');
      },
    },
  ]) {
    let cleared = 0,
      disabled = 0;
    const f = fixture({
      ...options,
      clearIntervalImpl: () => {
        cleared++;
      },
      monitor: {
        enable() {},
        disable() {
          disabled++;
        },
        reset() {},
        max: NaN,
        percentile: () => NaN,
      },
    });
    assert.doesNotThrow(() =>
      f.observer.ingress(
        { headers: { 'x-genfeed-ci-attempt': '1' } },
        f.response(),
      ),
    );
    f.stop();
    f.stop();
    assert.equal(cleared, 2);
    assert.equal(disabled, 1);
    if (f.lines.at(-1)?.kind === 'footer')
      assert.equal(f.lines.at(-1).unavailable, true);
  }
});
test('runtime histogram and CPU deltas use measured nulls and fixed sample fields', () => {
  let usage = { user: 10, system: 5 };
  const f = fixture({
    cpuUsage: () => usage,
    monitor: {
      enable() {},
      disable() {},
      reset() {},
      max: 2e6,
      percentile: () => NaN,
    },
  });
  f.tick(1250);
  usage = { user: 20, system: 8 };
  f.runtimeTick();
  f.stop();
  const sample = f.lines.find((r) => r.kind === 'runtime');
  assert.equal(sample.tickLagMs, 250);
  assert.equal(sample.eventLoopMaxMs, 2);
  assert.equal(sample.eventLoopP99Ms, null);
  assert.equal(sample.cpuUserUs, 10);
  assert.equal(sample.cpuSystemUs, 3);
});
test('database sampler uses one fixed read-only query, no overlapping call or retry, and counts busy/incomplete', async () => {
  let resolve,
    calls = 0;
  const pool = {
    query: (sql) => {
      calls++;
      assert.equal(sql, DATABASE_QUERY);
      return new Promise((r) => {
        resolve = r;
      });
    },
    end: () => Promise.resolve(),
  };
  const f = fixture({ pool });
  f.databaseTick();
  await Promise.resolve();
  f.databaseTick();
  assert.equal(calls, 1);
  f.tick(500);
  resolve({
    rows: [
      {
        state: 'active',
        wait_event_type: 'Lock',
        sessions: '2',
        blocked_sessions: '1',
        active_age_ms: '500',
      },
    ],
  });
  await new Promise((r) => setImmediate(r));
  f.stop();
  assert.deepEqual(
    f.lines.find((r) => r.kind === 'database' && r.outcome === 'success')
      .groups,
    [
      {
        state: 'active',
        waitType: 'Lock',
        sessions: 2,
        blockedSessions: 1,
        activeAgeMs: 500,
      },
    ],
  );
  assert.equal(
    f.lines.filter((r) => r.kind === 'database' && r.outcome === 'busy').length,
    1,
  );
  assert.deepEqual(POOL_OPTIONS, {
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 500,
    query_timeout: 750,
    statement_timeout: 500,
    allowExitOnIdle: true,
  });
  const pending = fixture({
    pool: { query: () => new Promise(() => {}), end: () => Promise.resolve() },
  });
  pending.databaseTick();
  pending.stop();
  assert.equal(pending.lines.at(-1).databaseIncomplete, 1);
});
test('database failure and malformed rows remain fixed observations', async () => {
  for (const error of [
    { name: 'TimeoutError', message: 'private' },
    { code: '57014', message: 'private' },
    { name: 'Error', stack: 'private' },
  ]) {
    let calls = 0;
    const f = fixture({
      pool: {
        query: async () => {
          calls++;
          throw error;
        },
        end: () => Promise.resolve(),
      },
    });
    f.databaseTick();
    await new Promise((r) => setImmediate(r));
    f.stop();
    assert.equal(calls, 1);
    assert.equal(f.lines.find((r) => r.kind === 'database').groups.length, 0);
    assert.equal(JSON.stringify(f.lines).includes('private'), false);
  }
  assert.throws(() =>
    normalizeDatabaseRows([
      {
        state: 'active',
        wait_event_type: null,
        sessions: 'private',
        blocked_sessions: 0,
        active_age_ms: 0,
      },
    ]),
  );
  assert.throws(() =>
    normalizeDatabaseRows([
      {
        state: 'active',
        wait_event_type: null,
        sessions: 1,
        blocked_sessions: 0,
        active_age_ms: 0,
      },
      {
        state: 'active',
        wait_event_type: null,
        sessions: 1,
        blocked_sessions: 0,
        active_age_ms: 0,
      },
    ]),
  );
});
test('preloader is dormant by default and rejects explicit invalid activation before startup', () => {
  const module = new URL('./api-observer.mjs', import.meta.url).href;
  const env = { ...process.env };
  delete env.CLOUD_SWEEP_DIAGNOSTICS;
  const off = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(module)});process.stdout.write(String(globalThis[Symbol.for('genfeed.cloudTenantGuard.observer.v1')]));`,
    ],
    { env, encoding: 'utf8' },
  );
  assert.equal(off.status, 0);
  assert.equal(off.stdout, 'undefined');
  const on = spawnSync(
    process.execPath,
    [
      '--import',
      new URL('./api-observer.mjs', import.meta.url).pathname,
      '-e',
      '',
    ],
    {
      env: { ...env, CLOUD_SWEEP_DIAGNOSTICS: '1', CI: 'false' },
      encoding: 'utf8',
    },
  );
  assert.notEqual(on.status, 0);
});

test('empty histogram remains unmeasured and malformed DB sample is counted without publishing rows', async () => {
  const f = fixture({
    monitor: {
      count: 0,
      max: 0,
      percentile: () => 0,
      enable() {},
      reset() {},
      disable() {},
    },
    pool: {
      query: async () => ({
        rows: [
          {
            state: 'active',
            wait_event_type: 'Lock',
            sessions: 'private-token',
            blocked_sessions: 0,
            active_age_ms: 0,
          },
        ],
      }),
      end: () => Promise.resolve(),
    },
  });
  f.tick(1000);
  f.runtimeTick();
  f.databaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  f.stop();
  assert.equal(f.lines.find((r) => r.kind === 'runtime').eventLoopMaxMs, null);
  assert.equal(f.lines.find((r) => r.kind === 'runtime').eventLoopP99Ms, null);
  assert.equal(f.lines.find((r) => r.kind === 'database').outcome, 'error');
  assert.equal(f.lines.at(-1).databaseSamples, 1);
  assert.equal(f.lines.at(-1).unavailable, true);
  assert.equal(JSON.stringify(f.lines).includes('private-token'), false);
});

for (const [message, category] of [
  ['Query read timeout', 'query-read-timeout'],
  ['Connection terminated due to connection timeout', 'connection-timeout'],
])
  test(`native DB diagnostic retains ${category} without changing outcome`, async () => {
    let queries = 0;
    const f = fixture({
      pool: {
        query: async () => {
          queries++;
          throw new Error(message);
        },
        end: async () => {},
      },
    });
    f.databaseTick();
    await new Promise((resolve) => setImmediate(resolve));
    f.stop();
    const record = f.lines.find((r) => r.kind === 'database');
    assert.equal(record.outcome, 'error');
    assert.deepEqual(record.diagnostic, {
      category,
      name: 'Error',
      code: 'NONE',
    });
    assert.equal(queries, 1);
  });

for (const [error, category, outcome] of [
  [
    { name: 'Error', code: '57014', message: 'hostile SQL canary' },
    'query-canceled',
    'timeout',
  ],
  [
    { name: 'Error', message: 'Connection terminated' },
    'connection-terminated',
    'error',
  ],
  [
    { name: 'error', message: 'Connection terminated unexpectedly' },
    'connection-terminated',
    'error',
  ],
  [
    { name: 'TimeoutError', message: 'hostile SQL canary' },
    'timeout',
    'timeout',
  ],
  [
    { name: 'Error', code: 'ECONNRESET', message: 'hostile SQL canary' },
    'transport',
    'error',
  ],
  [
    { name: 'DatabaseError', code: '40001', message: 'hostile SQL canary' },
    'database',
    'error',
  ],
  [
    {
      name: 'hostile-name',
      code: 'hostile-code',
      message: 'hostile SQL canary',
      cause: { code: '57014' },
    },
    'other',
    'error',
  ],
])
  test(`native database classifier preserves ${category}/${outcome}`, async () => {
    let calls = 0;
    const f = fixture({
      pool: {
        query: async (query) => {
          calls++;
          assert.equal(query, DATABASE_QUERY);
          throw error;
        },
        end: async () => {},
      },
    });
    f.databaseTick();
    await new Promise((resolve) => setImmediate(resolve));
    f.stop();
    const r = f.lines.find((record) => record.kind === 'database');
    assert.equal(r.outcome, outcome);
    assert.equal(r.diagnostic.category, category);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(r), /hostile|cause|message|stack|SQL/);
    validateObservationRecord(r);
  });
test('database diagnostic validates legacy/new success/failure and rejects unsafe optional fields', async () => {
  const base = {
    kind: 'database',
    start: 1,
    end: 2,
    outcome: 'success',
    groups: [],
  };
  validateObservationRecord(base);
  validateObservationRecord({ ...base, diagnostic: null });
  const error = { ...base, outcome: 'error' };
  validateObservationRecord(error);
  validateObservationRecord({
    ...error,
    diagnostic: { category: 'query-read-timeout', name: 'Error', code: 'NONE' },
  });
  for (const diagnostic of [
    null,
    { category: 'other', name: 'secret', code: 'NONE' },
    { category: 'other', name: 'Error', code: 'secret' },
    { category: 'other', name: 'Error', code: 'NONE', message: 'secret' },
    { category: 'busy', name: 'NONE', code: 'NONE' },
  ])
    assert.throws(() => validateObservationRecord({ ...error, diagnostic }));
  assert.throws(() =>
    validateObservationRecord({
      ...base,
      diagnostic: { category: 'other', name: 'Error', code: 'NONE' },
    }),
  );
  assert.throws(() =>
    validateObservationRecord({ ...base, diagnostic: null, sql: 'canary' }),
  );
  const malformed = fixture({
    pool: {
      query: async () => ({
        rows: [
          {
            state: 'active',
            wait_event_type: null,
            sessions: -1,
            blocked_sessions: 0,
            active_age_ms: 0,
          },
        ],
      }),
      end: async () => {},
    },
  });
  malformed.databaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  malformed.stop();
  assert.deepEqual(
    malformed.lines.find((r) => r.kind === 'database').diagnostic,
    { category: 'invalid-rows', name: 'NONE', code: 'NONE' },
  );
  let resolveQuery;
  const busy = fixture({
    pool: {
      query: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
      end: async () => {},
    },
  });
  busy.databaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  busy.databaseTick();
  assert.deepEqual(busy.lines.find((r) => r.kind === 'database').diagnostic, {
    category: 'busy',
    name: 'NONE',
    code: 'NONE',
  });
  resolveQuery({ rows: [] });
  await new Promise((resolve) => setImmediate(resolve));
  busy.stop();
});
