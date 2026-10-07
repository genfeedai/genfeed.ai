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
  const pool = Object.assign(new EventEmitter(), {
    idleCount: 1,
    totalCount: 1,
    query: async () => ({ rows: [] }),
    end: () => Promise.resolve(),
  });
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
    pool: options.pool ?? pool,
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
    min: 1,
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

test('v19 retained sampler preserves every clock and retains min one successful connection', () => {
  assert.deepEqual(POOL_OPTIONS, {
    min: 1,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 500,
    query_timeout: 750,
    statement_timeout: 500,
    allowExitOnIdle: true,
  });
});

test('v19 native Pool reuses successful fake Client beyond idle timeout with no second handshake', async (t) => {
  const { createRequire } = await import('node:module');
  const apiRequire = createRequire(
    new URL('../../../apps/server/api/package.json', import.meta.url),
  );
  const { Pool } = apiRequire('pg');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let handshakes = 0,
    queries = 0;
  class FakeClient extends EventEmitter {
    constructor() {
      super();
      this._queryable = true;
      this._ending = false;
      this.connection = { stream: { ref() {}, unref() {} } };
    }
    connect(callback) {
      handshakes++;
      callback(null);
    }
    query(...args) {
      queries++;
      args.at(-1)(null, { rows: [] });
    }
    end(callback) {
      this._ending = true;
      callback?.();
      this.emit('end');
    }
    ref() {}
    unref() {}
  }
  const pool = new Pool({ ...POOL_OPTIONS, Client: FakeClient });
  const f = fixture({ pool });
  try {
    f.databaseTick();
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(2001);
    f.tick(2001);
    f.databaseTick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handshakes, 1, 'successful idle client must remain retained');
    assert.equal(queries, 2, 'one unchanged query per sample');
    assert.deepEqual(
      f.lines
        .filter((record) => record.kind === 'database')
        .map((record) => [
          record.connectionStateAtStart,
          record.connectionGenerationBefore,
          record.connectionGenerationAfter,
        ]),
      [
        ['initial', 0, 1],
        ['retained', 1, 1],
      ],
    );
  } finally {
    f.stop();
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.reset();
  }
});

test('connection lifecycle records initial retained reconnect and ambiguous pool state without extra queries or listener removal', async () => {
  const pool = Object.assign(new EventEmitter(), {
    idleCount: 0,
    totalCount: 0,
    end: () => Promise.resolve(),
  });
  let calls = 0,
    fail = false;
  pool.query = async (sql) => {
    assert.equal(sql, DATABASE_QUERY);
    calls++;
    if (fail)
      throw new Error('Connection terminated due to connection timeout');
    if (pool.totalCount === 0) {
      pool.totalCount = 1;
      pool.emit('connect', {});
    }
    pool.idleCount = 1;
    return { rows: [] };
  };
  const unowned = () => {};
  pool.on('connect', unowned);
  const f = fixture({ pool });
  async function sample() {
    f.tick(2001);
    f.databaseTick();
    await new Promise((resolve) => setImmediate(resolve));
    return f.lines.filter((r) => r.kind === 'database').at(-1);
  }
  const initial = await sample();
  assert.equal(initial.connectionStateAtStart, 'initial');
  assert.equal(initial.connectionGenerationBefore, 0);
  assert.equal(initial.connectionGenerationAfter, 1);
  const retained = await sample();
  assert.equal(retained.connectionStateAtStart, 'retained');
  assert.equal(retained.connectionGenerationAfter, 1);
  pool.idleCount = 0;
  pool.totalCount = 0;
  fail = true;
  const reconnect = await sample();
  assert.equal(reconnect.connectionStateAtStart, 'reconnect');
  assert.equal(reconnect.outcome, 'error');
  assert.equal(reconnect.connectionGenerationAfter, 1);
  fail = false;
  const replaced = await sample();
  assert.equal(replaced.connectionStateAtStart, 'reconnect');
  assert.equal(replaced.connectionGenerationAfter, 2);
  pool.idleCount = 0;
  pool.totalCount = 1;
  const unknown = await sample();
  assert.equal(unknown.connectionStateAtStart, 'unknown');
  assert.equal(calls, 5);
  f.stop();
  assert.deepEqual(pool.listeners('connect'), [unowned]);
  assert.equal(f.lines.at(-1).databaseIncomplete, 0);
});

test('first failed handshake stays initial; absent listeners and generation overflow remain unavailable', async () => {
  const pool = Object.assign(new EventEmitter(), {
    idleCount: 0,
    totalCount: 0,
    query: async () => {
      throw new Error('Connection terminated due to connection timeout');
    },
    end: () => Promise.resolve(),
  });
  const f = fixture({ pool });
  f.databaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  const sample = f.lines.find((r) => r.kind === 'database');
  assert.equal(sample.connectionStateAtStart, 'initial');
  assert.equal(sample.connectionGenerationBefore, 0);
  assert.equal(sample.connectionGenerationAfter, 0);
  f.stop();
  assert.equal(f.lines.at(-1).unavailable, false);
  const overflow = fixture({
    pool: Object.assign(new EventEmitter(), { end: () => Promise.resolve() }),
  });
  for (let i = 0; i < 451; i++) overflow.pool.emit('connect', {});
  overflow.stop();
  assert.equal(overflow.lines.at(-1).unavailable, true);
  const missing = fixture({ pool: { end: () => Promise.resolve() } });
  missing.stop();
  assert.equal(missing.lines.at(-1).unavailable, true);
});

test('optional lifecycle schemas reject partial unsafe and invented connection attribution', () => {
  const base = {
    kind: 'database',
    start: 1,
    end: 2,
    outcome: 'error',
    diagnostic: { category: 'connection-timeout', name: 'Error', code: 'NONE' },
    groups: [],
  };
  assert.doesNotThrow(() => validateObservationRecord(base));
  const current = {
    ...base,
    connectionStateAtStart: 'initial',
    connectionGenerationBefore: 0,
    connectionGenerationAfter: 0,
  };
  assert.doesNotThrow(() => validateObservationRecord(current));
  for (const change of [
    (r) => delete r.connectionGenerationAfter,
    (r) => (r.connectionGenerationAfter = 451),
    (r) => (r.connectionGenerationBefore = -1),
    (r) => (r.connectionStateAtStart = 'host-canary'),
    (r) => (r.connectionStateAtStart = 'retained'),
    (r) => (r.sql = 'sql-canary'),
    (r) => {
      r.connectionGenerationBefore = 2;
      r.connectionGenerationAfter = 1;
      r.connectionStateAtStart = 'reconnect';
    },
  ]) {
    const bad = structuredClone(current);
    change(bad);
    assert.throws(() => validateObservationRecord(bad));
  }
});

// The private scope must survive asynchronous work without changing native outcomes.
test('tenant throw scope isolates concurrent continuations and retains detached work', async () => {
  const f = fixture();
  const requests = [1, 2].map((sequence) => ({
    headers: { 'x-genfeed-ci-attempt': String(sequence) },
  }));
  const responses = requests.map(() => f.response());
  requests.forEach((request, i) => {
    f.observer.ingress(request, responses[i]);
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = f.observer.bindRequest(requests[0], async () => {
    await gate;
    f.observer.tenantFailure(
      'Credential',
      'findFirst',
      'organization-id-mismatch',
    );
    responses[0].emit('finish');
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.observer.tenantFailure(
      'Credential',
      'findFirst',
      'organization-id-mismatch',
    );
    f.observer.bindRequest({ headers: {} }, () =>
      f.observer.tenantFailure(
        'Credential',
        'findFirst',
        'organization-id-mismatch',
      ),
    )();
  })();
  await f.observer.bindRequest(requests[1], async () => {
    await Promise.resolve();
    f.observer.tenantFailure('Member', 'findFirst', 'missing-organization-id');
    release();
  })();
  await first;
  f.observer.tenantFailure(
    'Credential',
    'findFirst',
    'organization-id-mismatch',
  );
  await f.stop();
  const events = f.lines.filter((r) => r.kind === 'tenantFailure');
  assert.deepEqual(
    events.map((r) => r.sequence),
    [2, 1, 1, null, null],
  );
  assert.deepEqual(
    events.map((r) => r.ordinal),
    [1, 2, 3, 4, 5],
  );
  assert.equal(f.lines[0].tenantFailuresVersion, 1);
  assert.equal(f.lines.at(-1).tenantFailures, 5);
  assert.equal(f.lines.at(-1).ingress, 2);
  assert.equal(f.lines.at(-1).finishes, 1);
});
test('binding propagates original application failures exactly once', async () => {
  const f = fixture();
  const error = new Error('private application failure');
  let calls = 0;
  assert.throws(
    f.observer.bindRequest({ headers: {} }, () => {
      calls++;
      throw error;
    }),
    (e) => e === error,
  );
  await assert.rejects(
    f.observer.bindRequest({ headers: {} }, async () => {
      calls++;
      throw error;
    })(),
    (e) => e === error,
  );
  assert.equal(calls, 2);
  await f.stop();
  assert.equal(f.lines.at(-1).unavailable, false);
});

test('invalid headers never inherit another request sequence', async () => {
  const f = fixture();
  const first = { headers: { 'x-genfeed-ci-attempt': '1' } };
  f.observer.ingress(first, f.response());
  f.observer.bindRequest(first, () => {
    for (const header of ['01', ['1', '2'], '1']) {
      const invalid = { headers: { 'x-genfeed-ci-attempt': header } };
      f.observer.ingress(invalid, f.response());
      f.observer.bindRequest(invalid, () =>
        f.observer.tenantFailure(
          'Credential',
          'findFirst',
          'organization-id-mismatch',
        ),
      )();
    }
  })();
  await f.stop();
  assert.deepEqual(
    f.lines.filter((r) => r.kind === 'tenantFailure').map((r) => r.sequence),
    [null, null, null],
  );
  assert.equal(f.lines.at(-1).unavailable, true);
  assert.equal(f.lines.at(-1).invalidSequences, 2);
  assert.equal(f.lines.at(-1).duplicateSequences, 1);
});
test('tenant event cap and failed writes remain fatal, never usable lower totals', async () => {
  const f = fixture();
  for (let i = 0; i < 10001; i++)
    f.observer.tenantFailure(
      'Credential',
      'findFirst',
      'organization-id-mismatch',
    );
  await f.stop();
  assert.equal(f.lines.filter((r) => r.kind === 'tenantFailure').length, 10000);
  assert.equal(f.lines.at(-1).tenantFailures, 10000);
  assert.equal(f.lines.at(-1).unavailable, true);
  const records = [];
  const failed = fixture({
    write(line) {
      const record = JSON.parse(line);
      if (record.kind === 'tenantFailure') throw new Error('write');
      records.push(record);
    },
  });
  failed.observer.tenantFailure(
    'Credential',
    'findFirst',
    'organization-id-mismatch',
  );
  await failed.stop();
  assert.equal(records.at(-1).unavailable, true);
  assert.equal(records.at(-1).tenantFailures, 1);
  assert.equal(records.filter((r) => r.kind === 'tenantFailure').length, 0);
});
test('unsafe tenant producer enums never serialize canaries', async () => {
  const f = fixture();
  for (const tuple of [
    ['secret-model', 'findFirst', 'organization-id-mismatch'],
    ['Credential', 'secret-operation', 'organization-id-mismatch'],
    ['Credential', 'findFirst', 'secret-reason'],
  ])
    f.observer.tenantFailure(...tuple);
  await f.stop();
  assert.equal(f.lines.at(-1).unavailable, true);
  assert.equal(f.lines.at(-1).tenantFailures, 0);
  assert.doesNotMatch(JSON.stringify(f.lines), /secret-/);
});
