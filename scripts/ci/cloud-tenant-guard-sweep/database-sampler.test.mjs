import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  createApiObserver,
  MAX_BYTES,
  MAX_RECORDS,
} from './api-observer-core.mjs';
import {
  createSamplerController,
  createSamplerWriter,
  installPassiveSamplerStop,
  readIsolatedSampler,
  reserveSamplerBudget,
  SAMPLER_SLOTS,
  validateSamplerData,
} from './database-sampler-core.mjs';

function directory(t) {
  const d = mkdtempSync(join(tmpdir(), 'sampler-owned-'));
  chmodSync(d, 0o700);
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
const binding = {
  version: 1,
  producer: 'api',
  runNonce: 'a'.repeat(32),
  sourceSha: 'b'.repeat(40),
};
function sealedFixture(t, { database = [], api = [], mutate = () => {} } = {}) {
  const d = directory(t),
    control = new SharedArrayBuffer(24);
  let clock = 100;
  const db = [],
    a = [];
  const timers = [];
  const pool = Object.assign(new EventEmitter(), {
    idleCount: 0,
    totalCount: 0,
    query: async () => ({ rows: [] }),
    end: async () => {},
  });
  const apiInstance = createApiObserver({
    producer: 'api',
    databaseSampler: binding,
    databaseWorker: () => ({
      readyObservedAt: 101,
      stopRequestedAt: 200,
      stopCompletedAt: 202,
      state: 'complete',
    }),
    now: () => clock,
    write: (line) => a.push(JSON.parse(line)),
    setIntervalImpl: () => ({ unref() {} }),
    clearIntervalImpl: () => {},
  });
  clock = 101;
  const dbInstance = createApiObserver({
    producer: 'database',
    databaseSampler: { ...binding, producer: 'database' },
    pool,
    now: () => clock,
    write: (line) => db.push(JSON.parse(line)),
    setIntervalImpl: (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    clearIntervalImpl: () => {},
  });
  a.push(...api);
  db.push(...database);
  clock = 201;
  dbInstance.stop();
  clock = 203;
  apiInstance.stop();
  for (const records of [a, db]) {
    const f = records.at(-1);
    f.records = records.length - 1;
    f.databaseSamples = records.filter((r) => r.kind === 'database').length;
    f.tenantFailures = records.filter((r) => r.kind === 'tenantFailure').length;
  }
  const dbWriter = createSamplerWriter(
    d,
    'database-observations.ndjson',
    control,
  );
  for (const r of db) dbWriter.write(`${JSON.stringify(r)}\n`);
  const meta = dbWriter.close();
  const seal = {
    version: 1,
    runNonce: binding.runNonce,
    sourceSha: binding.sourceSha,
    state: 'complete',
    readyAt: 101,
    stopReceivedAt: 200,
    sealedAt: 202,
    ...meta,
  };
  mutate({ api: a, database: db, seal });
  writeFileSync(
    join(d, 'database-observations.ndjson'),
    `${db.map((r) => JSON.stringify(r)).join('\n')}\n`,
    { mode: 0o600 },
  );
  // Mutation fixtures intentionally retain the original digest, proving independent validation.
  const apiWriter = createSamplerWriter(d, 'api-observations.ndjson', control);
  for (const r of a) apiWriter.write(`${JSON.stringify(r)}\n`);
  apiWriter.close();
  const sealWriter = createSamplerWriter(
    d,
    'database-observations.seal.json',
    control,
  );
  sealWriter.write(`${JSON.stringify(seal)}\n`);
  sealWriter.close();
  return {
    directory: d,
    api: a,
    db,
    seal,
    control,
    buffer: readFileSync(join(d, 'api-observations.ndjson')),
    sourceSha: binding.sourceSha,
  };
}

test('producer split rejects disabled direct ticks and leaves combined timer contract unchanged', () => {
  const pool = Object.assign(new EventEmitter(), { end: async () => {} });
  for (const mode of ['api', 'database', 'combined']) {
    const periods = [],
      lines = [];
    const f = createApiObserver({
      producer: mode,
      pool,
      write: (l) => lines.push(JSON.parse(l)),
      setIntervalImpl: (_fn, period) => {
        periods.push(period);
        return { unref() {} };
      },
      clearIntervalImpl: () => {},
    });
    assert.deepEqual(
      periods,
      mode === 'api' ? [1000] : mode === 'database' ? [2000] : [1000, 2000],
    );
    if (mode === 'api') assert.throws(f.databaseTick, /disabled/);
    if (mode === 'database') assert.throws(f.runtimeTick, /disabled/);
    f.stop();
    assert.equal(lines.at(-1).unavailable, false);
  }
  assert.throws(() => createApiObserver({ producer: 'unknown' }));
});
test('shared budget consumes reservations before writes and never expands either combined cap', () => {
  for (const [slot, cap] of [
    [SAMPLER_SLOTS.bytes, MAX_BYTES],
    [SAMPLER_SLOTS.records, MAX_RECORDS],
  ]) {
    const control = new SharedArrayBuffer(24),
      state = new Int32Array(control);
    Atomics.store(state, slot, cap - 1);
    reserveSamplerBudget(control, 1);
    assert.throws(() => reserveSamplerBudget(control, 1));
    assert.equal(Atomics.load(state, SAMPLER_SLOTS.fatal), 1);
    assert.throws(() => reserveSamplerBudget(control, 0, 0));
  }
});
test('exact private workerData excludes env/import/path injections', (t) => {
  const data = {
    version: 1,
    directory: directory(t),
    sourceSha: binding.sourceSha,
    runNonce: binding.runNonce,
    connectionString: 'private-url',
    control: new SharedArrayBuffer(24),
  };
  assert.equal(validateSamplerData(data), data);
  for (const patch of [
    { extra: true },
    { control: new SharedArrayBuffer(4) },
    { sourceSha: 'bad' },
    { runNonce: 'bad' },
    { connectionString: null },
  ])
    assert.throws(() => validateSamplerData({ ...data, ...patch }));
});
test('writer rejects reuse and symlink and keeps owned streams private', (t) => {
  const d = directory(t),
    control = new SharedArrayBuffer(24);
  const w = createSamplerWriter(d, 'api-observations.ndjson', control);
  w.write('safe\n');
  const meta = w.close();
  assert.equal(meta.bytes, 5);
  assert.equal(meta.records, 1);
  assert.throws(() => w.write('late\n'));
  assert.throws(() =>
    createSamplerWriter(d, 'api-observations.ndjson', control),
  );
  symlinkSync(
    join(d, 'api-observations.ndjson'),
    join(d, 'database-observations.ndjson'),
  );
  assert.throws(() =>
    createSamplerWriter(d, 'database-observations.ndjson', control),
  );
});
test('independent sealed producer reader conserves both streams and excludes private binding', (t) => {
  const f = sealedFixture(t);
  const result = readIsolatedSampler(f.directory, f.buffer, f.sourceSha);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].databaseSampler, undefined);
  assert.equal(result.records.at(-1).databaseWorker, undefined);
  assert.equal(result.records.at(-1).records, 1);
});
for (const [label, mutate] of [
  [
    'hash',
    ({ seal }) => {
      seal.sha256 = '0'.repeat(64);
    },
  ],
  [
    'size',
    ({ seal }) => {
      seal.bytes++;
    },
  ],
  [
    'count',
    ({ seal }) => {
      seal.records++;
    },
  ],
  [
    'source',
    ({ seal }) => {
      seal.sourceSha = 'c'.repeat(40);
    },
  ],
  [
    'nonce',
    ({ seal }) => {
      seal.runNonce = 'c'.repeat(32);
    },
  ],
  [
    'clock',
    ({ seal }) => {
      seal.readyAt = 99;
    },
  ],
  [
    'early-stop',
    ({ api }) => {
      api.at(-1).databaseWorker.stopCompletedAt = 199;
    },
  ],
  [
    'worker-failed',
    ({ api }) => {
      api.at(-1).databaseWorker.state = 'failed';
    },
  ],
  [
    'API-db',
    ({ api }) => {
      api.splice(1, 0, {
        kind: 'database',
        start: 110,
        end: 120,
        outcome: 'success',
        groups: [],
      });
    },
  ],
  [
    'regression',
    ({ api }) => {
      api.splice(1, 0, {
        kind: 'runtime',
        start: 99,
        end: 99,
        tickLagMs: 0,
        eventLoopMaxMs: null,
        eventLoopP99Ms: null,
        cpuUserUs: 0,
        cpuSystemUs: 0,
        activeRequests: 0,
        observerWriteMaxUs: 0,
      });
    },
  ],
])
  test(`sealed collector rejects ${label}`, (t) => {
    const f = sealedFixture(t, { mutate });
    assert.throws(() =>
      readIsolatedSampler(f.directory, f.buffer, f.sourceSha),
    );
  });
test('passive adapter never adds a lone signal handler, precedes later application handlers and detaches after last removal', () => {
  const target = new EventEmitter(),
    order = [];
  const drain = installPassiveSamplerStop(() => {
    order.push('drain');
    return 1;
  }, target);
  assert.equal(target.listenerCount('SIGTERM'), 0);
  const app = () => order.push('app');
  target.on('SIGTERM', app);
  assert.equal(target.listenerCount('SIGTERM'), 2);
  target.emit('SIGTERM');
  assert.deepEqual(order, ['drain', 'app']);
  target.emit('exit');
  assert.equal(order.filter((x) => x === 'drain').length, 1);
  assert.equal(drain(), 1);
  const other = new EventEmitter();
  installPassiveSamplerStop(() => {}, other);
  other.on('SIGINT', app);
  other.removeListener('SIGINT', app);
  assert.equal(other.listenerCount('SIGINT'), 0);
});

test('database-only fake cadence never overlaps or loses a terminal pending sample during drain', async () => {
  let resolveQuery,
    calls = 0,
    clock = 100;
  const records = [];
  const pool = Object.assign(new EventEmitter(), {
    idleCount: 0,
    totalCount: 0,
    query: () => {
      calls++;
      pool.emit('connect');
      return new Promise((resolve) => {
        resolveQuery = resolve;
      });
    },
    end: async () => {},
  });
  const f = createApiObserver({
    producer: 'database',
    pool,
    write: (l) => records.push(JSON.parse(l)),
    now: () => clock,
    setIntervalImpl: () => ({ unref() {} }),
    clearIntervalImpl: () => {},
  });
  clock = 200;
  f.databaseTick();
  await Promise.resolve();
  clock = 201;
  f.databaseTick();
  assert.equal(calls, 1);
  assert.equal(records.find((r) => r.kind === 'database').outcome, 'busy');
  const drained = f.drain();
  clock = 202;
  resolveQuery({ rows: [] });
  await drained;
  f.stop({ poolEnded: true });
  assert.equal(records.filter((r) => r.kind === 'database').length, 2);
  assert.equal(records.at(-1).databaseIncomplete, 0);
  assert.equal(records.at(-1).databaseSamples, 2);
});

for (const [label, mutate] of [
  [
    'request-in-worker',
    ({ database }) =>
      database.splice(1, 0, { kind: 'ingress', sequence: 1, at: 102 }),
  ],
  [
    'duplicate-header',
    ({ database }) => database.splice(1, 0, { ...database[0] }),
  ],
  ['missing-footer', ({ database }) => database.pop()],
  [
    'db-counter',
    ({ database }) => {
      database.at(-1).databaseSamples = 1;
    },
  ],
  [
    'worker-runtime',
    ({ database }) => {
      database.at(-1).runtimeSamples = 1;
    },
  ],
  [
    'sample-outside-life',
    ({ database }) => {
      database.splice(1, 0, {
        kind: 'database',
        start: 99,
        end: 102,
        outcome: 'success',
        groups: [],
      });
      database.at(-1).databaseSamples = 1;
      database.at(-1).records++;
    },
  ],
  [
    'future-stop',
    ({ api }) => {
      api.at(-1).databaseWorker.stopRequestedAt = 204;
    },
  ],
])
  test(`independent producer schema rejects ${label} before merge`, (t) => {
    const f = sealedFixture(t, { mutate });
    assert.throws(() =>
      readIsolatedSampler(f.directory, f.buffer, f.sourceSha),
    );
  });
test('missing or unsafe worker seal cannot reuse healthy API evidence', (t) => {
  const f = sealedFixture(t);
  rmSync(join(f.directory, 'database-observations.seal.json'));
  assert.throws(() => readIsolatedSampler(f.directory, f.buffer, f.sourceSha));
  symlinkSync(
    join(f.directory, 'api-observations.ndjson'),
    join(f.directory, 'database-observations.seal.json'),
  );
  assert.throws(() => readIsolatedSampler(f.directory, f.buffer, f.sourceSha));
});
test('actual concurrent workers share one byte cap and conservative failed reservations', async () => {
  const control = new SharedArrayBuffer(24),
    state = new Int32Array(control);
  const module = new URL('./database-sampler-core.mjs', import.meta.url).href;
  const code = `const {workerData,parentPort}=require('node:worker_threads');(async()=>{const {reserveSamplerBudget,MAX_BYTES}=await import(${JSON.stringify(module)});const s=new Int32Array(workerData);while(!Atomics.load(s,0))Atomics.wait(s,0,0,100);let failed=false;try{reserveSamplerBudget(workerData,4194304);reserveSamplerBudget(workerData,1);}catch{failed=true;}parentPort.postMessage({failed});parentPort.close();})()`;
  const workers = [0, 1].map(
    () =>
      new Worker(code, {
        eval: true,
        workerData: control,
        env: {},
        execArgv: [],
      }),
  );
  const finished = workers.map(
    (w) =>
      new Promise((resolve, reject) => {
        w.once('exit', (code) =>
          code === 0 ? resolve() : reject(Error('worker failed')),
        );
        w.once('error', reject);
      }),
  );
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);
  await Promise.all(finished);
  assert.equal(Atomics.load(state, 3), 1);
  assert.ok(Atomics.load(state, 4) > MAX_BYTES);
  assert.throws(() => reserveSamplerBudget(control, 0, 0));
});

async function controlledStop(
  t,
  { onMessage = () => {}, onWait = () => {} } = {},
) {
  const d = directory(t),
    control = new SharedArrayBuffer(24),
    state = new Int32Array(control),
    data = {
      version: 1,
      directory: d,
      sourceSha: binding.sourceSha,
      runNonce: binding.runNonce,
      connectionString: 'private-url',
      control,
    };
  let clock = 10,
    clockCalls = 0;
  const waits = [],
    messages = [];
  const worker = Object.assign(new EventEmitter(), {
    unref() {},
    postMessage: (message) => {
      messages.push(message);
      onMessage({
        state,
        setClock: (n) => {
          clock = n;
        },
      });
    },
  });
  const pending = createSamplerController(worker, data, {
    monotonicNow: () => {
      clockCalls++;
      return clock;
    },
    wait: (_state, slot, expected, remaining) => {
      assert.equal(slot, 2);
      assert.equal(expected, 0);
      waits.push(remaining);
      onWait({
        state,
        remaining,
        count: waits.length,
        setClock: (n) => {
          clock = n;
        },
        advance: (n) => {
          clock += n;
        },
      });
    },
  });
  Atomics.store(state, 0, 1);
  worker.emit('message', {
    type: 'ready',
    version: 1,
    runNonce: data.runNonce,
    readyAt: Date.now(),
  });
  const controller = await pending;
  return { controller, state, waits, messages, clockCalls: () => clockCalls };
}
test('single injected monotonic stop deadline consumes exactly2000/1500/500 remaining waits without rearm', async (t) => {
  const f = await controlledStop(t, {
    onWait: ({ advance, count }) => advance([500, 1000, 500][count - 1]),
  });
  const receipt = f.controller.stop();
  assert.equal(receipt.state, 'timeout');
  assert.deepEqual(f.waits, [2000, 1500, 500]);
  assert.equal(f.messages.length, 1);
  assert.equal(Atomics.load(f.state, 1), 1);
  assert.equal(Atomics.load(f.state, 3), 1);
  const calls = f.clockCalls();
  assert.equal(f.controller.stop(), receipt);
  assert.equal(f.clockCalls(), calls);
  assert.deepEqual(f.waits, [2000, 1500, 500]);
  assert.equal(f.messages.length, 1);
});
test('postMessage consuming the whole budget starts zero waits and stays fatal', async (t) => {
  const f = await controlledStop(t, {
    onMessage: ({ setClock }) => setClock(2010),
  });
  assert.equal(f.controller.stop().state, 'timeout');
  assert.deepEqual(f.waits, []);
  assert.equal(Atomics.load(f.state, 3), 1);
});
for (const [label, ack, time, expected] of [
  ['early', 1, 510, 'complete'],
  ['failed', 2, 510, 'failed'],
  ['late', 1, 2011, 'timeout'],
  ['exact-deadline', 1, 2010, 'complete'],
])
  test(`native acknowledgment first observed ${label} respects absolute deadline`, async (t) => {
    const f = await controlledStop(t, {
      onWait: ({ state, setClock }) => {
        Atomics.store(state, 2, ack);
        setClock(time);
      },
    });
    const receipt = f.controller.stop();
    assert.equal(receipt.state, expected);
    assert.deepEqual(f.waits, [2000]);
    assert.equal(Atomics.load(f.state, 3), expected === 'complete' ? 0 : 1);
    assert.equal(f.controller.stop(), receipt);
  });
