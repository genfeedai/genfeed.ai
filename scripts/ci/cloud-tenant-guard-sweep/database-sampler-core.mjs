import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import {
  CONNECTION_FIELDS,
  createApiObserver,
  exact,
  MAX_BYTES,
  MAX_RECORDS,
  safe,
  validateObservationRecord,
} from './api-observer-core.mjs';
import { validateRunDirectory } from './local-mail-stub.mjs';

export const SAMPLER_SLOTS = Object.freeze({
  ready: 0,
  stop: 1,
  exit: 2,
  fatal: 3,
  bytes: 4,
  records: 5,
});
const failure = () => new Error('Database sampler evidence unavailable');
export function validateSamplerData(data) {
  exact(data, [
    'version',
    'directory',
    'sourceSha',
    'runNonce',
    'connectionString',
    'control',
  ]);
  if (
    data.version !== 1 ||
    !/^[a-f0-9]{40}$/.test(data.sourceSha) ||
    !/^[a-f0-9]{32}$/.test(data.runNonce) ||
    typeof data.connectionString !== 'string' ||
    !data.connectionString ||
    !(data.control instanceof SharedArrayBuffer) ||
    data.control.byteLength !== 24
  )
    throw failure();
  validateRunDirectory(data.directory);
  const state = new Int32Array(data.control);
  for (const [slot, maximum] of [
    [0, 2],
    [1, 1],
    [2, 2],
    [3, 1],
    [4, MAX_BYTES],
    [5, MAX_RECORDS],
  ]) {
    const value = Atomics.load(state, slot);
    if (value < 0 || value > maximum) throw failure();
  }
  return data;
}
export function reserveSamplerBudget(control, bytes, records = 1) {
  if (!(control instanceof SharedArrayBuffer) || control.byteLength !== 24)
    throw failure();
  safe(bytes);
  safe(records);
  const state = new Int32Array(control);
  const totalBytes = Atomics.add(state, SAMPLER_SLOTS.bytes, bytes) + bytes;
  const totalRecords =
    Atomics.add(state, SAMPLER_SLOTS.records, records) + records;
  if (
    totalBytes > MAX_BYTES ||
    totalRecords > MAX_RECORDS ||
    Atomics.load(state, SAMPLER_SLOTS.fatal)
  ) {
    Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
    throw failure();
  }
}
export function createSamplerWriter(directory, name, control) {
  try {
    return openSamplerWriter(directory, name, control);
  } catch {
    if (control instanceof SharedArrayBuffer && control.byteLength === 24)
      Atomics.store(new Int32Array(control), SAMPLER_SLOTS.fatal, 1);
    throw failure();
  }
}
function openSamplerWriter(directory, name, control) {
  validateRunDirectory(directory);
  if (
    ![
      'api-observations.ndjson',
      'database-observations.ndjson',
      'database-observations.seal.json',
    ].includes(name)
  )
    throw failure();
  const fd = openSync(
    join(directory, name),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  let bytes = 0,
    records = 0,
    closed = false;
  const hash = createHash('sha256');
  const stat = fstatSync(fd);
  if (
    !stat.isFile() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o600
  ) {
    closeSync(fd);
    throw failure();
  }
  return {
    write(line) {
      try {
        if (closed) throw failure();
        const buffer = Buffer.from(line);
        reserveSamplerBudget(control, buffer.length);
        if (writeSync(fd, buffer) !== buffer.length) throw failure();
        hash.update(buffer);
        bytes += buffer.length;
        records++;
      } catch {
        Atomics.store(new Int32Array(control), SAMPLER_SLOTS.fatal, 1);
        throw failure();
      }
    },
    close() {
      if (closed) throw failure();
      closed = true;
      try {
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch {
        Atomics.store(new Int32Array(control), SAMPLER_SLOTS.fatal, 1);
        throw failure();
      }
      return { bytes, records, sha256: hash.digest('hex') };
    },
  };
}
export async function runDatabaseSampler(
  data,
  pool,
  port,
  { now = Date.now } = {},
) {
  validateSamplerData(data);
  const state = new Int32Array(data.control);
  if ([0, 1, 2, 3].some((slot) => Atomics.load(state, slot) !== 0))
    throw failure();
  const stream = createSamplerWriter(
    data.directory,
    'database-observations.ndjson',
    data.control,
  );
  let metadata,
    readyAt,
    stopReceivedAt,
    stopping = false,
    complete = false;
  const observer = createApiObserver({
    producer: 'database',
    pool,
    now,
    write: stream.write,
    close: () => {
      metadata = stream.close();
    },
    databaseSampler: {
      version: 1,
      producer: 'database',
      runNonce: data.runNonce,
      sourceSha: data.sourceSha,
    },
  });
  const failed = () => {
    Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
    Atomics.store(state, SAMPLER_SLOTS.exit, 2);
    Atomics.notify(state, SAMPLER_SLOTS.exit);
  };
  process.once('exit', (code) => {
    Atomics.store(
      state,
      SAMPLER_SLOTS.exit,
      code === 0 && complete && !Atomics.load(state, SAMPLER_SLOTS.fatal)
        ? 1
        : 2,
    );
    Atomics.notify(state, SAMPLER_SLOTS.exit);
  });
  const stop = async (message) => {
    try {
      exact(message, ['type', 'stopRequestedAt']);
      safe(message.stopRequestedAt);
      if (
        message.type !== 'stop' ||
        stopping ||
        Atomics.load(state, SAMPLER_SLOTS.stop) !== 1
      )
        throw failure();
      stopping = true;
      stopReceivedAt = now();
      if (stopReceivedAt < message.stopRequestedAt) throw failure();
      await observer.drain();
      observer.stop({ poolEnded: true });
      if (!metadata || Atomics.load(state, SAMPLER_SLOTS.fatal))
        throw failure();
      const seal = {
        version: 1,
        runNonce: data.runNonce,
        sourceSha: data.sourceSha,
        state: 'complete',
        readyAt,
        stopReceivedAt,
        sealedAt: now(),
        ...metadata,
      };
      const writer = createSamplerWriter(
        data.directory,
        'database-observations.seal.json',
        data.control,
      );
      writer.write(`${JSON.stringify(seal)}\n`);
      writer.close();
      complete = true;
      port.close();
    } catch {
      failed();
      process.exitCode = 1;
      port.close();
    }
  };
  if (Atomics.load(state, SAMPLER_SLOTS.fatal)) throw failure();
  port.on('message', stop);
  readyAt = now();
  Atomics.store(state, SAMPLER_SLOTS.ready, 1);
  Atomics.notify(state, SAMPLER_SLOTS.ready);
  port.postMessage({
    type: 'ready',
    version: 1,
    runNonce: data.runNonce,
    readyAt,
  });
}
export async function startDatabaseSampler(data) {
  validateSamplerData(data);
  const worker = new Worker(
    new URL('./database-sampler-worker.mjs', import.meta.url),
    { env: {}, execArgv: [], workerData: data },
  );
  return createSamplerController(worker, data);
}
export async function createSamplerController(worker, data, options = {}) {
  exact(
    options,
    ['monotonicNow', 'wait'].filter((key) => Object.hasOwn(options, key)),
  );
  const monotonicNow = options.monotonicNow ?? (() => performance.now()),
    wait = options.wait ?? Atomics.wait;
  if (typeof monotonicNow !== 'function' || typeof wait !== 'function')
    throw failure();
  validateSamplerData(data);
  const state = new Int32Array(data.control);
  let receipt,
    stopped = false;
  const readyObservedAt = await new Promise((resolve, reject) => {
    const rejectFixed = () => {
      Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
      reject(failure());
    };
    worker.once('error', rejectFixed);
    worker.once('exit', rejectFixed);
    worker.once('message', (message) => {
      try {
        exact(message, ['type', 'version', 'runNonce', 'readyAt']);
        safe(message.readyAt);
        if (
          message.type !== 'ready' ||
          message.version !== 1 ||
          message.runNonce !== data.runNonce ||
          Atomics.load(state, SAMPLER_SLOTS.ready) !== 1 ||
          message.readyAt > Date.now()
        )
          throw failure();
        worker.removeListener('error', rejectFixed);
        worker.removeListener('exit', rejectFixed);
        resolve(Date.now());
      } catch {
        rejectFixed();
      }
    });
  });
  worker.on('error', () => {
    Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
  });
  worker.on('exit', (code) => {
    if (code !== 0) Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
  });
  worker.on('message', () => {
    Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
  });
  worker.unref();
  return {
    worker,
    stop() {
      if (stopped) return receipt;
      stopped = true;
      const stopRequestedAt = Date.now(),
        deadline = monotonicNow() + 2000;
      Atomics.store(state, SAMPLER_SLOTS.stop, 1);
      worker.postMessage({ type: 'stop', stopRequestedAt });
      let status,
        timedOut = false;
      while (true) {
        status = Atomics.load(state, SAMPLER_SLOTS.exit);
        const observedAt = monotonicNow();
        if (status !== 0) {
          timedOut = observedAt > deadline;
          break;
        }
        const remaining = deadline - observedAt;
        if (remaining <= 0) {
          timedOut = true;
          break;
        }
        wait(state, SAMPLER_SLOTS.exit, 0, remaining);
      }
      if (monotonicNow() > deadline) timedOut = true;
      if (status !== 1 || timedOut)
        Atomics.store(state, SAMPLER_SLOTS.fatal, 1);
      receipt = {
        readyObservedAt,
        stopRequestedAt,
        stopCompletedAt: Date.now(),
        state:
          status === 1 && !timedOut && !Atomics.load(state, SAMPLER_SLOTS.fatal)
            ? 'complete'
            : timedOut || status === 0
              ? 'timeout'
              : 'failed',
      };
      return receipt;
    },
  };
}
export function installPassiveSamplerStop(stop, target = process) {
  let drained = false,
    receipt,
    changing = false;
  const signals = ['SIGTERM', 'SIGINT'];
  const drain = () => {
    if (!drained) {
      drained = true;
      receipt = stop();
      for (const signal of signals)
        target.removeListener(signal, handlers[signal]);
    }
    return receipt;
  };
  const handlers = { SIGTERM: drain, SIGINT: drain };
  const applications = (signal) =>
    target
      .rawListeners(signal)
      .filter(
        (listener) => (listener.listener ?? listener) !== handlers[signal],
      );
  const synchronize = (signal, adding) => {
    if (changing || drained || !signals.includes(signal)) return;
    changing = true;
    try {
      if (adding || applications(signal).length) {
        if (
          !target
            .rawListeners(signal)
            .some(
              (listener) =>
                (listener.listener ?? listener) === handlers[signal],
            )
        )
          target.prependOnceListener(signal, handlers[signal]);
      } else target.removeListener(signal, handlers[signal]);
    } finally {
      changing = false;
    }
  };
  target.on('newListener', (signal, listener) => {
    if (listener !== handlers[signal]) synchronize(signal, true);
  });
  target.on('removeListener', (signal, listener) => {
    if ((listener.listener ?? listener) !== handlers[signal])
      synchronize(signal, false);
  });
  for (const signal of signals) synchronize(signal, false);
  target.once('exit', drain);
  return drain;
}
export function readSamplerOwned(directory, name) {
  validateRunDirectory(directory);
  const fd = openSync(
    join(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > MAX_BYTES
    )
      throw failure();
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
function parseProducer(buffer, producer, binding) {
  const text = buffer.toString('utf8');
  if (!text.endsWith('\n')) throw failure();
  const records = text
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (records.length < 2 || records.length > MAX_RECORDS) throw failure();
  let last = -1,
    lastQueryEnd = -1,
    lastGeneration = 0;
  for (const [i, record] of records.entries()) {
    validateObservationRecord(record);
    const at = record.at ?? record.end ?? record.startedAt ?? record.endedAt;
    if (at < last) throw failure();
    last = at;
    if (
      (record.kind === 'header') !== (i === 0) ||
      (record.kind === 'footer') !== (i === records.length - 1)
    )
      throw failure();
    if (
      producer === 'database' &&
      !['header', 'database', 'footer'].includes(record.kind)
    )
      throw failure();
    if (producer === 'api' && record.kind === 'database') throw failure();
    if (record.kind === 'database') {
      if (
        CONNECTION_FIELDS.some((key) => !Object.hasOwn(record, key)) ||
        !Object.hasOwn(record, 'diagnostic')
      )
        throw failure();
      if (
        record.start < records[0].startedAt ||
        record.end > records.at(-1).endedAt
      )
        throw failure();
      if (record.connectionGenerationBefore < lastGeneration) throw failure();
      lastGeneration = record.connectionGenerationAfter;
      if (record.outcome !== 'busy') {
        if (record.start < lastQueryEnd) throw failure();
        lastQueryEnd = record.end;
      }
    }
    if (
      record.kind === 'runtime' &&
      (record.start < records[0].startedAt ||
        record.end > records.at(-1).endedAt)
    )
      throw failure();
  }
  const header = records[0],
    footer = records.at(-1);
  if (
    !header.databaseSampler ||
    Object.keys(binding).some(
      (key) => header.databaseSampler[key] !== binding[key],
    )
  )
    throw failure();
  if (footer.records !== records.length - 1 || footer.databaseIncomplete > 1)
    throw failure();
  if (producer === 'database') {
    for (const key of [
      'ingress',
      'pipelineEntries',
      'finishes',
      'closes',
      'invalidSequences',
      'duplicateSequences',
      'runtimeSamples',
      'tenantFailures',
    ])
      if (footer[key] !== 0) throw failure();
    if (
      footer.databaseSamples !==
      records.filter((r) => r.kind === 'database').length
    )
      throw failure();
  } else if (footer.databaseSamples !== 0 || footer.databaseIncomplete !== 0)
    throw failure();
  return records;
}
export function readIsolatedSampler(
  directory,
  apiBuffer,
  sourceSha,
  { final = true } = {},
) {
  const apiHeader = JSON.parse(apiBuffer.toString('utf8').split('\n')[0]);
  const binding = apiHeader.databaseSampler;
  if (binding?.producer !== 'api' || binding.sourceSha !== sourceSha)
    throw failure();
  if (!final) {
    const api = apiBuffer
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (!api.some((r) => r.kind === 'footer')) {
      let database = [];
      try {
        const raw = readSamplerOwned(directory, 'database-observations.ndjson');
        if (!raw.toString('utf8').endsWith('\n')) throw failure();
        database = raw
          .toString('utf8')
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      for (const [records, role] of [
        [api, 'api'],
        [database, 'database'],
      ]) {
        let last = -1;
        for (const [i, r] of records.entries()) {
          validateObservationRecord(r);
          const at = r.at ?? r.end ?? r.startedAt;
          if (
            at < last ||
            (r.kind === 'header') !== (i === 0) ||
            r.kind === 'footer' ||
            (role === 'api' && r.kind === 'database') ||
            (role === 'database' && !['header', 'database'].includes(r.kind))
          )
            throw failure();
          last = at;
        }
        if (
          records.length &&
          Object.keys(binding).some(
            (key) =>
              records[0].databaseSampler?.[key] !==
              { ...binding, producer: role }[key],
          )
        )
          throw failure();
      }
      const header = { ...api[0] };
      delete header.databaseSampler;
      return {
        api,
        database,
        records: [
          header,
          ...[...api.slice(1), ...database.slice(1)].sort(
            (a, b) => (a.at ?? a.end) - (b.at ?? b.end),
          ),
        ],
      };
    }
  }
  const dbBuffer = readSamplerOwned(directory, 'database-observations.ndjson'),
    sealBuffer = readSamplerOwned(directory, 'database-observations.seal.json');
  const api = parseProducer(apiBuffer, 'api', binding),
    database = parseProducer(dbBuffer, 'database', {
      ...binding,
      producer: 'database',
    }),
    seal = JSON.parse(sealBuffer.toString('utf8'));
  exact(seal, [
    'version',
    'runNonce',
    'sourceSha',
    'state',
    'readyAt',
    'stopReceivedAt',
    'sealedAt',
    'bytes',
    'records',
    'sha256',
  ]);
  for (const key of [
    'readyAt',
    'stopReceivedAt',
    'sealedAt',
    'bytes',
    'records',
  ])
    safe(seal[key]);
  if (
    seal.version !== 1 ||
    seal.state !== 'complete' ||
    seal.runNonce !== binding.runNonce ||
    seal.sourceSha !== sourceSha ||
    seal.bytes !== dbBuffer.length ||
    seal.records !== database.length ||
    seal.sha256 !== createHash('sha256').update(dbBuffer).digest('hex')
  )
    throw failure();
  if (
    apiBuffer.length + dbBuffer.length + sealBuffer.length > MAX_BYTES ||
    api.length + database.length + 1 > MAX_RECORDS
  )
    throw failure();
  const a = api.at(-1),
    d = database.at(-1),
    control = a.databaseWorker;
  if (control?.state !== 'complete') throw failure();
  const times = [
    api[0].startedAt,
    database[0].startedAt,
    seal.readyAt,
    control.readyObservedAt,
  ];
  const stopTimes = [
    control.stopRequestedAt,
    seal.stopReceivedAt,
    d.endedAt,
    seal.sealedAt,
    control.stopCompletedAt,
    a.endedAt,
  ];
  for (const list of [times, stopTimes])
    for (let i = 1; i < list.length; i++)
      if (list[i] < list[i - 1]) throw failure();
  if (control.stopRequestedAt < control.readyObservedAt) throw failure();
  const interiors = [...api.slice(1, -1), ...database.slice(1, -1)].sort(
    (x, y) => (x.at ?? x.end) - (y.at ?? y.end),
  );
  const footer = {
    ...a,
    records: interiors.length + 1,
    databaseSamples: d.databaseSamples,
    databaseIncomplete: d.databaseIncomplete,
    unavailable: a.unavailable || d.unavailable,
  };
  delete footer.databaseWorker;
  const header = { ...api[0] };
  delete header.databaseSampler;
  return { api, database, records: [header, ...interiors, footer] };
}
