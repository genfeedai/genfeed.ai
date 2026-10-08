import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  CONNECTION_STATES,
  exact,
  MAX_BYTES,
  MAX_RECORDS,
  STATES,
  safe,
  validateDatabaseDiagnostic,
  validateObservationRecord,
  WAITS,
} from './api-observer-core.mjs';
import { readIsolatedSampler } from './database-sampler-core.mjs';
import { validateRunDirectory } from './local-mail-stub.mjs';
import {
  MAX_TENANT_FAILURES,
  schemaModels,
  validateTenantFailure,
} from './tenant-evidence-policy.mjs';
export const CAUSAL_CLASSES = [
  'telemetryIncomplete',
  'noIngress',
  'finished408',
  'finishedOtherFailure',
  'finishedSuccess',
  'closedBeforePipeline',
  'closedAfterPipeline',
  'openBeforePipeline',
  'openAfterPipeline',
];
export const CAUSAL_REASONS = [
  'missingFooter',
  'missingStop',
  'invalidSchema',
  'duplicateSequence',
  'missingSequence',
  'unmatchedServer',
  'observerUnavailable',
  'samplerFailure',
  'clockRegression',
  'capacityExceeded',
];
const METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'other',
];
const METRICS = [
  'queueWaitMs',
  'headerMs',
  'bodyMs',
  'totalMs',
  'ingressToFirstPipelineMs',
  'pipelineToFinishMs',
  'ingressToCloseMs',
];
const zeroReasons = () =>
  Object.fromEntries(CAUSAL_REASONS.map((reason) => [reason, 0]));
const metric = () => ({ measuredCount: 0, sum: 0, max: null });
const maximum = (a, b) => (b === null ? a : a === null ? b : Math.max(a, b));
function addMetric(target, value) {
  if (value === undefined || value === null) return;
  safe(value);
  target.measuredCount = safe(target.measuredCount + 1);
  target.sum = safe(target.sum + value);
  target.max = maximum(target.max, value);
}
function readOwned(directory, name) {
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
      throw new Error('Invalid owned observation file');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}
function runtimeAggregate(samples) {
  const result = {
    measuredSamples: samples.length,
    maxTickLagMs: null,
    maxEventLoopMaxMs: null,
    maxEventLoopP99Ms: null,
    maxCpuUserUs: null,
    maxCpuSystemUs: null,
    maxActiveRequests: null,
  };
  for (const sample of samples)
    for (const [output, input] of [
      ['maxTickLagMs', 'tickLagMs'],
      ['maxEventLoopMaxMs', 'eventLoopMaxMs'],
      ['maxEventLoopP99Ms', 'eventLoopP99Ms'],
      ['maxCpuUserUs', 'cpuUserUs'],
      ['maxCpuSystemUs', 'cpuSystemUs'],
      ['maxActiveRequests', 'activeRequests'],
    ])
      result[output] = maximum(result[output], sample[input]);
  return result;
}
function databaseAggregate(samples) {
  const groups = new Map();
  for (const sample of samples)
    for (const item of sample.groups) {
      const key = `${item.state}/${item.waitType}`;
      const group = groups.get(key) ?? {
        state: item.state,
        waitType: item.waitType,
        maxSessions: 0,
        maxBlockedSessions: 0,
        maxActiveAgeMs: 0,
      };
      group.maxSessions = Math.max(group.maxSessions, item.sessions);
      group.maxBlockedSessions = Math.max(
        group.maxBlockedSessions,
        item.blockedSessions,
      );
      group.maxActiveAgeMs = Math.max(group.maxActiveAgeMs, item.activeAgeMs);
      groups.set(key, group);
    }
  const lifecycleGroups = new Map();
  let lifecycleAvailable = true;
  for (const sample of samples) {
    const present = Object.hasOwn(sample, 'connectionStateAtStart');
    if (!present || sample.connectionStateAtStart === 'unknown')
      lifecycleAvailable = false;
    const tuple = {
      outcome: sample.outcome,
      connectionStateAtStart: sample.connectionStateAtStart ?? 'unknown',
      generationBefore: sample.connectionGenerationBefore ?? null,
      generationAfter: sample.connectionGenerationAfter ?? null,
    };
    const key = JSON.stringify(tuple);
    const group = lifecycleGroups.get(key) ?? { ...tuple, samples: 0 };
    group.samples = safe(group.samples + 1);
    lifecycleGroups.set(key, group);
  }
  const failures = new Map();
  let failureAttributionAvailable = true;
  for (const sample of samples.filter(
    (sample) => sample.outcome !== 'success',
  )) {
    if (!Object.hasOwn(sample, 'diagnostic'))
      failureAttributionAvailable = false;
    const diagnostic = sample.diagnostic ?? {
      category: 'unavailable',
      name: 'NONE',
      code: 'NONE',
    };
    const tuple = { outcome: sample.outcome, ...diagnostic };
    const key = JSON.stringify(tuple);
    const group = failures.get(key) ?? {
      ...tuple,
      samples: 0,
      durationMs: 0,
      maxDurationMs: 0,
    };
    const duration = safe(sample.end - sample.start);
    group.samples = safe(group.samples + 1);
    group.durationMs = safe(group.durationMs + duration);
    group.maxDurationMs = Math.max(group.maxDurationMs, duration);
    failures.set(key, group);
    if (failures.size > 256)
      throw new Error('Too many database failure groups');
  }
  return {
    lifecycleAvailable,
    lifecycleGroups: [...lifecycleGroups]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, group]) => group),
    failureAttributionAvailable,
    failureGroups: [...failures]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, group]) => group),
    measuredSamples: samples.filter((s) => s.outcome === 'success').length,
    failedSamples: samples.filter((s) => s.outcome !== 'success').length,
    groups: [...groups]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, g]) => g),
  };
}
const FAILURE_RELATIONS = [
  'overlaps-instrumented-attempt',
  'before-first-instrumented-attempt',
  'after-last-instrumented-attempt',
  'between-instrumented-attempts',
  'unavailable',
];
function failureWindowProjection(samples, runtime, clients, origin) {
  const offset = (at) =>
    Number.isSafeInteger(origin) && Number.isSafeInteger(at) && at >= origin
      ? at - origin
      : null;
  const clientClocks =
    clients.length > 0 &&
    clients.every(
      (client) =>
        offset(client.sentAtEpochMs) !== null &&
        offset(client.endedAtEpochMs) !== null &&
        client.endedAtEpochMs >= client.sentAtEpochMs &&
        (client.headerAtEpochMs === null ||
          (Number.isSafeInteger(client.headerAtEpochMs) &&
            client.headerAtEpochMs >= client.sentAtEpochMs &&
            client.headerAtEpochMs <= client.endedAtEpochMs)),
    );
  const sourceClocks = [...samples, ...runtime].every(
    (sample) => offset(sample.start) !== null && offset(sample.end) !== null,
  );
  const available =
    Number.isSafeInteger(origin) && clientClocks && sourceClocks;
  const first = available
    ? Math.min(...clients.map((c) => c.sentAtEpochMs))
    : null;
  const last = available
    ? Math.max(...clients.map((c) => c.endedAtEpochMs))
    : null;
  const used = new Set();
  const windows = samples.flatMap((sample, index) => {
    if (sample.outcome === 'success') return [];
    const startOffsetMs = offset(sample.start);
    const endOffsetMs = offset(sample.end);
    const knownRuntime =
      startOffsetMs !== null &&
      endOffsetMs !== null &&
      runtime.every((r) => offset(r.start) !== null && offset(r.end) !== null);
    const runtimeWindowOrdinals = knownRuntime
      ? runtime.flatMap((record, ordinal) => {
          if (record.end < sample.start || record.start > sample.end) return [];
          used.add(ordinal + 1);
          return [ordinal + 1];
        })
      : null;
    const overlappingClientAttempts = available
      ? clients.filter(
          (c) =>
            sample.end >= c.sentAtEpochMs && sample.start <= c.endedAtEpochMs,
        ).length
      : null;
    const relation = !available
      ? 'unavailable'
      : overlappingClientAttempts > 0
        ? 'overlaps-instrumented-attempt'
        : sample.end < first
          ? 'before-first-instrumented-attempt'
          : sample.start > last
            ? 'after-last-instrumented-attempt'
            : 'between-instrumented-attempts';
    return [
      {
        observationOrdinal: index + 1,
        startOffsetMs,
        endOffsetMs,
        durationMs: safe(sample.end - sample.start),
        outcome: sample.outcome,
        ...(sample.diagnostic ?? {
          category: 'unavailable',
          name: 'NONE',
          code: 'NONE',
        }),
        connectionStateAtStart: sample.connectionStateAtStart ?? 'unknown',
        generationBefore: sample.connectionGenerationBefore ?? null,
        generationAfter: sample.connectionGenerationAfter ?? null,
        relation,
        overlappingClientAttempts,
        runtimeWindowOrdinals,
      },
    ];
  });
  return {
    version: 1,
    available,
    firstClientStartOffsetMs: first === null ? null : offset(first),
    lastClientEndOffsetMs: last === null ? null : offset(last),
    windows,
    runtimeWindows: runtime.flatMap((record, index) =>
      used.has(index + 1)
        ? [
            {
              ordinal: index + 1,
              startOffsetMs: offset(record.start),
              endOffsetMs: offset(record.end),
              tickLagMs: record.tickLagMs,
              eventLoopMaxMs: record.eventLoopMaxMs,
              eventLoopP99Ms: record.eventLoopP99Ms,
            },
          ]
        : [],
    ),
  };
}
function validateFailureWindowIdentity(window, sampleCount) {
  exact(window, [
    'observationOrdinal',
    'startOffsetMs',
    'endOffsetMs',
    'durationMs',
    'outcome',
    'category',
    'name',
    'code',
    'connectionStateAtStart',
    'generationBefore',
    'generationAfter',
    'relation',
    'overlappingClientAttempts',
    'runtimeWindowOrdinals',
  ]);
  safe(window.observationOrdinal);
  if (
    !window.observationOrdinal ||
    window.observationOrdinal > sampleCount ||
    !['error', 'timeout', 'busy'].includes(window.outcome) ||
    !CONNECTION_STATES.includes(window.connectionStateAtStart) ||
    !FAILURE_RELATIONS.includes(window.relation)
  )
    throw new Error('Invalid database temporal identity');
  if (window.category === 'unavailable') {
    if (window.name !== 'NONE' || window.code !== 'NONE')
      throw new Error('Invalid legacy temporal diagnostic');
  } else
    validateDatabaseDiagnostic(
      {
        category: window.category,
        name: window.name,
        code: window.code,
      },
      window.outcome,
    );
  const legacy =
    window.generationBefore === null && window.generationAfter === null;
  if (legacy) {
    if (window.connectionStateAtStart !== 'unknown')
      throw new Error('Invalid legacy temporal lifecycle');
  } else {
    for (const key of ['generationBefore', 'generationAfter']) {
      safe(window[key]);
      if (window[key] > 450) throw new Error('Invalid temporal generation');
    }
    if (
      window.generationAfter < window.generationBefore ||
      (window.connectionStateAtStart === 'initial' &&
        window.generationBefore !== 0) ||
      (['retained', 'reconnect'].includes(window.connectionStateAtStart) &&
        window.generationBefore === 0) ||
      (window.outcome === 'busy' && window.connectionStateAtStart !== 'unknown')
    )
      throw new Error('Inconsistent temporal generation');
  }
  safe(window.durationMs);
  for (const key of ['startOffsetMs', 'endOffsetMs'])
    if (window[key] !== null) safe(window[key]);
  if (
    window.startOffsetMs !== null &&
    window.endOffsetMs !== null &&
    window.endOffsetMs - window.startOffsetMs !== window.durationMs
  )
    throw new Error('Invalid temporal duration');
}
function validateFailureWindowRelation(window, projection, attempts) {
  const first = projection.firstClientStartOffsetMs;
  const last = projection.lastClientEndOffsetMs;
  const count = window.overlappingClientAttempts;
  if (!projection.available) {
    if (window.relation !== 'unavailable' || count !== null)
      throw new Error('Invalid unavailable temporal relation');
    return;
  }
  safe(count);
  if (
    window.startOffsetMs === null ||
    window.endOffsetMs === null ||
    count > attempts ||
    window.relation === 'unavailable'
  )
    throw new Error('Invalid available temporal relation');
  const start = window.startOffsetMs,
    end = window.endOffsetMs;
  const valid = {
    'overlaps-instrumented-attempt': count > 0 && end >= first && start <= last,
    'before-first-instrumented-attempt': count === 0 && end < first,
    'after-last-instrumented-attempt': count === 0 && start > last,
    'between-instrumented-attempts':
      count === 0 && end >= first && start <= last,
  };
  if (!valid[window.relation])
    throw new Error('Inconsistent temporal relation');
}
function validateFailureWindowReferences(window, runtime, used) {
  const refs = window.runtimeWindowOrdinals;
  if (refs === null) {
    if (
      window.startOffsetMs !== null &&
      window.endOffsetMs !== null &&
      runtime.size
    )
      throw new Error('Unknown temporal references with known runtime');
    return;
  }
  if (
    !Array.isArray(refs) ||
    refs.length > 900 ||
    window.startOffsetMs === null
  )
    throw new Error('Invalid temporal references');
  let previous = 0;
  for (const ordinal of refs) {
    safe(ordinal);
    if (ordinal <= previous || !runtime.has(ordinal))
      throw new Error('Duplicate or dangling temporal reference');
    previous = ordinal;
    used.add(ordinal);
  }
  for (const [ordinal, record] of runtime) {
    const overlaps =
      record.endOffsetMs >= window.startOffsetMs &&
      record.startOffsetMs <= window.endOffsetMs;
    if (refs.includes(ordinal) !== overlaps)
      throw new Error('Inconsistent runtime temporal overlap');
  }
}
function validateFailureWindows(projection, database, attempts) {
  exact(projection, [
    'version',
    'available',
    'firstClientStartOffsetMs',
    'lastClientEndOffsetMs',
    'windows',
    'runtimeWindows',
  ]);
  if (
    projection.version !== 1 ||
    typeof projection.available !== 'boolean' ||
    !Array.isArray(projection.windows) ||
    projection.windows.length > 450 ||
    projection.windows.length !== database.failedSamples ||
    !Array.isArray(projection.runtimeWindows) ||
    projection.runtimeWindows.length > 900 ||
    !Array.isArray(database.failureGroups)
  )
    throw new Error('Invalid database temporal projection');
  const first = projection.firstClientStartOffsetMs,
    last = projection.lastClientEndOffsetMs;
  if (projection.available) {
    safe(first);
    safe(last);
    if (!attempts || last < first)
      throw new Error('Invalid temporal client bounds');
  } else if (first !== null || last !== null)
    throw new Error('Invalid unavailable temporal bounds');
  const runtime = new Map();
  let previous = 0;
  for (const record of projection.runtimeWindows) {
    exact(record, [
      'ordinal',
      'startOffsetMs',
      'endOffsetMs',
      'tickLagMs',
      'eventLoopMaxMs',
      'eventLoopP99Ms',
    ]);
    for (const key of ['ordinal', 'startOffsetMs', 'endOffsetMs', 'tickLagMs'])
      safe(record[key]);
    for (const key of ['eventLoopMaxMs', 'eventLoopP99Ms'])
      if (record[key] !== null) safe(record[key]);
    if (
      record.ordinal <= previous ||
      record.ordinal > 900 ||
      record.endOffsetMs < record.startOffsetMs
    )
      throw new Error('Invalid temporal runtime record');
    previous = record.ordinal;
    runtime.set(record.ordinal, record);
  }
  const groups = new Map(),
    used = new Set();
  previous = 0;
  for (const window of projection.windows) {
    validateFailureWindowIdentity(
      window,
      database.measuredSamples + database.failedSamples,
    );
    if (window.observationOrdinal <= previous)
      throw new Error('Unsorted temporal window');
    previous = window.observationOrdinal;
    validateFailureWindowRelation(window, projection, attempts);
    if (projection.available && window.runtimeWindowOrdinals === null)
      throw new Error('Unknown available runtime references');
    validateFailureWindowReferences(window, runtime, used);
    const key = JSON.stringify([
      window.outcome,
      window.category,
      window.name,
      window.code,
    ]);
    const group = groups.get(key) ?? {
      samples: 0,
      durationMs: 0,
      maxDurationMs: 0,
    };
    group.samples = safe(group.samples + 1);
    group.durationMs = safe(group.durationMs + window.durationMs);
    group.maxDurationMs = Math.max(group.maxDurationMs, window.durationMs);
    groups.set(key, group);
  }
  if (
    used.size !== runtime.size ||
    groups.size !== database.failureGroups.length
  )
    throw new Error('Nonconserved temporal records');
  for (const expected of database.failureGroups) {
    const key = JSON.stringify([
      expected.outcome,
      expected.category,
      expected.name,
      expected.code,
    ]);
    const actual = groups.get(key);
    if (
      !actual ||
      ['samples', 'durationMs', 'maxDurationMs'].some(
        (k) => actual[k] !== expected[k],
      )
    )
      throw new Error('Nonconserved temporal failure tuple');
  }
}

function unavailableTenantFailures() {
  return {
    version: 1,
    available: false,
    total: null,
    attributed: null,
    unattributed: null,
    groups: [],
  };
}
function tenantFailureProjection(events, clients, templates, actors, phases) {
  const candidates = new Map();
  for (const client of clients) {
    const list = candidates.get(client.sequence) ?? [];
    list.push(client);
    candidates.set(client.sequence, list);
  }
  const groups = new Map();
  let attributed = 0;
  for (const event of events) {
    const matches = candidates.get(event.sequence) ?? [];
    const client = matches.length === 1 ? matches[0] : undefined;
    const phase =
      client &&
      (Object.hasOwn(client, 'sweepPhase') ? client.sweepPhase : client.phase);
    const known =
      event.sequence !== null &&
      client &&
      Number.isSafeInteger(client.sequence) &&
      client.sequence > 0 &&
      Number.isSafeInteger(client.sentAtEpochMs) &&
      client.sentAtEpochMs >= 0 &&
      Number.isSafeInteger(client.endedAtEpochMs) &&
      client.endedAtEpochMs >= client.sentAtEpochMs &&
      (client.headerAtEpochMs === null ||
        (Number.isSafeInteger(client.headerAtEpochMs) &&
          client.headerAtEpochMs >= client.sentAtEpochMs &&
          client.headerAtEpochMs <= client.endedAtEpochMs)) &&
      actors.includes(client.actor) &&
      client.actor !== 'unknown' &&
      phases.includes(phase) &&
      phase !== 'unknown' &&
      METHODS.includes(client.method) &&
      client.method !== 'other' &&
      templates.has(client.route);
    const tuple = {
      actor: known ? client.actor : 'unknown',
      phase: known ? phase : 'unknown',
      method: known ? client.method : 'other',
      route: known ? client.route : 'unknown',
      model: event.model,
      operation: event.operation,
      reason: event.reason,
    };
    const key = JSON.stringify(Object.values(tuple));
    const group = groups.get(key) ?? { ...tuple, count: 0 };
    group.count = safe(group.count + 1);
    groups.set(key, group);
    attributed += Number(Boolean(known));
  }
  return {
    version: 1,
    available: true,
    total: events.length,
    attributed,
    unattributed: events.length - attributed,
    groups: [...groups]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, group]) => group),
  };
}
function validateTenantFailures(value, { templates, actors, phases }) {
  exact(value, [
    'version',
    'available',
    'total',
    'attributed',
    'unattributed',
    'groups',
  ]);
  if (
    value.version !== 1 ||
    typeof value.available !== 'boolean' ||
    !Array.isArray(value.groups) ||
    value.groups.length > MAX_TENANT_FAILURES
  )
    throw new Error('Invalid tenant provenance');
  if (!value.available) {
    if (
      value.total !== null ||
      value.attributed !== null ||
      value.unattributed !== null ||
      value.groups.length
    )
      throw new Error('Unavailable tenant provenance has counts');
    return;
  }
  schemaModels();
  for (const n of [value.total, value.attributed, value.unattributed]) {
    safe(n);
    if (n > MAX_TENANT_FAILURES)
      throw new Error('Tenant provenance capacity exceeded');
  }
  let total = 0,
    attributed = 0,
    previous;
  for (const group of value.groups) {
    exact(group, [
      'actor',
      'phase',
      'method',
      'route',
      'model',
      'operation',
      'reason',
      'count',
    ]);
    validateTenantFailure(group.model, group.operation, group.reason);
    safe(group.count);
    if (!group.count || group.count > MAX_TENANT_FAILURES)
      throw new Error('Invalid tenant group count');
    const known =
      actors.includes(group.actor) &&
      group.actor !== 'unknown' &&
      phases.includes(group.phase) &&
      group.phase !== 'unknown' &&
      METHODS.includes(group.method) &&
      group.method !== 'other' &&
      templates.includes(group.route);
    const unknown =
      group.actor === 'unknown' &&
      group.phase === 'unknown' &&
      group.method === 'other' &&
      group.route === 'unknown';
    if (!known && !unknown) throw new Error('Unsafe tenant attribution');
    const key = JSON.stringify([
      group.actor,
      group.phase,
      group.method,
      group.route,
      group.model,
      group.operation,
      group.reason,
    ]);
    if (previous !== undefined && key <= previous)
      throw new Error('Duplicate or unsorted tenant groups');
    previous = key;
    total = safe(total + group.count);
    if (known) attributed = safe(attributed + group.count);
  }
  if (
    total !== value.total ||
    attributed !== value.attributed ||
    value.total !== value.attributed + value.unattributed
  )
    throw new Error('Tenant provenance conservation failure');
}
export function joinCausalEvidence(
  report,
  records,
  {
    final = false,
    stopped = false,
    readFailure = false,
    actors = [],
    phases = [],
  } = {},
) {
  const reasons = zeroReasons();
  const lifecycles = new Map();
  const tenantEvents = [];
  let runtime = [],
    database = [],
    footer,
    valid = true,
    last = -1;
  if (readFailure) {
    reasons.invalidSchema++;
    valid = false;
  }
  try {
    if (
      !Array.isArray(records) ||
      records.length > MAX_RECORDS ||
      !records.length ||
      records[0].kind !== 'header'
    )
      throw new Error('Invalid observer stream');
    for (let i = 0; i < records.length; i++) {
      const record = validateObservationRecord(records[i]);
      const at = record.at ?? record.end ?? record.startedAt ?? record.endedAt;
      if (at < last) {
        reasons.clockRegression++;
        throw new Error('Observer clock regression');
      }
      last = at;
      if (record.kind === 'header') {
        if (i !== 0) throw new Error('Duplicate header');
        continue;
      }
      if (record.kind === 'footer') {
        if (i !== records.length - 1) throw new Error('Footer is not final');
        footer = record;
        continue;
      }
      if (record.kind === 'tenantFailure') {
        if (
          records[0].tenantFailuresVersion !== 1 ||
          record.ordinal !== tenantEvents.length + 1
        )
          throw new Error('Invalid tenant event ordinal');
        tenantEvents.push(record);
        continue;
      }
      if (record.kind === 'runtime') {
        if (runtime.length && record.start < runtime.at(-1).end)
          throw new Error('Runtime overlap');
        runtime.push(record);
        continue;
      }
      if (record.kind === 'database') {
        database.push(record);
        continue;
      }
      if (record.kind === 'ingress') {
        if (lifecycles.has(record.sequence)) {
          reasons.duplicateSequence++;
          throw new Error('Duplicate ingress');
        }
        lifecycles.set(record.sequence, {
          ingress: record,
          entries: new Map(),
        });
        continue;
      }
      const state = lifecycles.get(record.sequence);
      if (!state) throw new Error('Missing ingress');
      if (record.kind === 'finish') {
        if (state.finish || state.close)
          throw new Error('Duplicate or late finish');
        state.finish = record;
        continue;
      }
      if (record.kind === 'close') {
        if (state.close) throw new Error('Duplicate close');
        state.close = record;
        continue;
      }
      if (record.kind === 'pipelineEnter') {
        if (record.entry !== state.entries.size + 1)
          throw new Error('Invalid pipeline ordinal');
        state.entries.set(record.entry, { enter: record, next: 0, error: 0 });
        continue;
      }
      const entry = state.entries.get(record.entry);
      if (!entry || entry.finalize)
        throw new Error('Invalid pipeline lifecycle');
      if (record.kind === 'pipelineNext') entry.next++;
      if (record.kind === 'pipelineError') entry.error++;
      if (record.kind === 'pipelineFinalize') entry.finalize = record;
    }
    if (runtime.length > 900 || database.length > 450) {
      reasons.capacityExceeded++;
      throw new Error('Sample capacity exceeded');
    }
    if (footer) {
      if (
        Object.hasOwn(records[0], 'tenantFailuresVersion') !==
          Object.hasOwn(footer, 'tenantFailures') ||
        (Object.hasOwn(footer, 'tenantFailures') &&
          footer.tenantFailures !== tenantEvents.length)
      )
        throw new Error('Tenant producer counter mismatch');
      if (
        footer.records !== records.length - 1 ||
        footer.ingress !== lifecycles.size ||
        footer.pipelineEntries !==
          [...lifecycles.values()].reduce(
            (sum, state) => sum + state.entries.size,
            0,
          ) ||
        footer.finishes !==
          [...lifecycles.values()].filter((state) => state.finish).length ||
        footer.closes !==
          [...lifecycles.values()].filter((state) => state.close).length ||
        footer.runtimeSamples !== runtime.length ||
        footer.databaseSamples !== database.length
      )
        throw new Error('Observer counter mismatch');
      reasons.observerUnavailable += Number(footer.unavailable);
      reasons.duplicateSequence += footer.duplicateSequences;
      reasons.invalidSchema += footer.invalidSequences;
      reasons.samplerFailure += footer.databaseIncomplete;
    }
  } catch {
    valid = false;
    reasons.invalidSchema = Math.max(1, reasons.invalidSchema);
    lifecycles.clear();
    runtime = [];
    database = [];
    footer = undefined;
  }
  if (!footer) reasons.missingFooter++;
  if (final && !stopped) reasons.missingStop++;
  reasons.samplerFailure += database.filter(
    (sample) =>
      sample.outcome !== 'success' ||
      (report.machineCoverageRequired === true &&
        (!Object.hasOwn(sample, 'connectionStateAtStart') ||
          sample.connectionStateAtStart === 'unknown')),
  ).length;
  const clients = report.requests ?? [],
    seen = new Set();
  let missing = false;
  for (const client of clients) {
    if (!Number.isSafeInteger(client.sequence) || client.sequence < 1) {
      reasons.missingSequence++;
      missing = true;
    } else if (seen.has(client.sequence)) {
      reasons.duplicateSequence++;
      missing = true;
    } else seen.add(client.sequence);
    if (
      !Number.isSafeInteger(client.sentAtEpochMs) ||
      !Number.isSafeInteger(client.endedAtEpochMs) ||
      client.sentAtEpochMs < 0 ||
      client.endedAtEpochMs < client.sentAtEpochMs ||
      (client.headerAtEpochMs !== null &&
        (!Number.isSafeInteger(client.headerAtEpochMs) ||
          client.headerAtEpochMs < client.sentAtEpochMs ||
          client.headerAtEpochMs > client.endedAtEpochMs))
    ) {
      reasons.invalidSchema++;
      missing = true;
    }
  }
  const unmatched = [...lifecycles.keys()].filter(
    (sequence) => !seen.has(sequence),
  ).length;
  reasons.unmatchedServer = unmatched;
  const quality =
    !valid ||
    missing ||
    unmatched ||
    Object.entries(reasons).some(([name, n]) => n && name !== 'missingFooter')
      ? 'incomplete'
      : !footer
        ? final
          ? 'incomplete'
          : 'partial'
        : 'complete';
  const classes = Object.fromEntries(CAUSAL_CLASSES.map((name) => [name, 0])),
    groups = new Map();
  const templates = new Set(report.inventoryTemplates ?? []);
  const overlap = (samples, client) =>
    samples.filter(
      (sample) =>
        sample.end >= client.sentAtEpochMs &&
        sample.start <= client.endedAtEpochMs,
    );
  let missingRuntimeWindows = 0,
    missingDatabaseWindows = 0;
  for (const client of clients) {
    const state = lifecycles.get(client.sequence),
      entries = state ? [...state.entries.values()] : [];
    const classification =
      quality !== 'complete'
        ? 'telemetryIncomplete'
        : !state
          ? 'noIngress'
          : state.finish?.status === 408
            ? 'finished408'
            : state.finish
              ? state.finish.status >= 400
                ? 'finishedOtherFailure'
                : 'finishedSuccess'
              : state.close
                ? entries.length
                  ? 'closedAfterPipeline'
                  : 'closedBeforePipeline'
                : entries.length
                  ? 'openAfterPipeline'
                  : 'openBeforePipeline';
    classes[classification]++;
    const phase = Object.hasOwn(client, 'sweepPhase')
      ? client.sweepPhase
      : client.phase;
    const tuple = {
      route: templates.has(client.route) ? client.route : null,
      actor: actors.includes(client.actor) ? client.actor : 'unknown',
      phase: phases.includes(phase) ? phase : 'unknown',
      method: METHODS.includes(client.method) ? client.method : 'other',
      classification,
      status: state?.finish?.status ?? null,
    };
    const key = JSON.stringify(Object.values(tuple));
    const group = groups.get(key) ?? {
      ...tuple,
      attempts: 0,
      pipelineEntries: 0,
      finalizedEntries: 0,
      repeatedPipelineAttempts: 0,
      emittedEntries: 0,
      erroredEntries: 0,
      durations: Object.fromEntries(METRICS.map((name) => [name, metric()])),
      runtimeWindows: new Set(),
      databaseWindows: new Set(),
      missingRuntimeWindows: 0,
      missingDatabaseWindows: 0,
    };
    group.attempts++;
    group.pipelineEntries += entries.length;
    group.finalizedEntries += entries.filter((e) => e.finalize).length;
    group.repeatedPipelineAttempts += Number(entries.length > 1);
    group.emittedEntries += entries.filter((e) => e.next).length;
    group.erroredEntries += entries.filter((e) => e.error).length;
    for (const name of METRICS.slice(0, 4))
      if (Number.isSafeInteger(client[name]) && client[name] >= 0)
        addMetric(group.durations[name], client[name]);
    if (entries.length)
      addMetric(
        group.durations.ingressToFirstPipelineMs,
        entries[0].enter.at - state.ingress.at,
      );
    if (entries.length && state.finish)
      addMetric(
        group.durations.pipelineToFinishMs,
        state.finish.at - entries[0].enter.at,
      );
    if (state?.close)
      addMetric(
        group.durations.ingressToCloseMs,
        state.close.at - state.ingress.at,
      );
    const rs = overlap(runtime, client),
      ds = overlap(database, client);
    rs.forEach((sample) => {
      group.runtimeWindows.add(sample);
    });
    ds.forEach((sample) => {
      group.databaseWindows.add(sample);
    });
    if (!rs.length) {
      group.missingRuntimeWindows++;
      missingRuntimeWindows++;
    }
    if (!ds.length) {
      group.missingDatabaseWindows++;
      missingDatabaseWindows++;
    }
    groups.set(key, group);
  }
  const requestGroups = [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, g]) => {
      const { runtimeWindows, databaseWindows, ...fixed } = g;
      return {
        ...fixed,
        runtime: runtimeAggregate([...runtimeWindows]),
        database: databaseAggregate([...databaseWindows]),
      };
    });
  const result = {
    version: 1,
    quality,
    reasons,
    conservation: {
      clientAttempts: clients.length,
      serverAttempts: lifecycles.size,
      matchedAttempts: [...lifecycles.keys()].filter((sequence) =>
        seen.has(sequence),
      ).length,
      unmatchedServerAttempts: unmatched,
      classes,
    },
    requestGroups,
    tenantFailures:
      valid &&
      footer &&
      records[0].tenantFailuresVersion === 1 &&
      !footer.unavailable &&
      !footer.invalidSequences &&
      !footer.duplicateSequences
        ? tenantFailureProjection(
            tenantEvents,
            clients,
            templates,
            actors,
            phases,
          )
        : unavailableTenantFailures(),
    runtime: {
      ...runtimeAggregate(runtime),
      cpuUserUs: runtime.reduce((sum, s) => safe(sum + s.cpuUserUs), 0),
      cpuSystemUs: runtime.reduce((sum, s) => safe(sum + s.cpuSystemUs), 0),
      missingWindows: missingRuntimeWindows,
    },
    database: {
      ...databaseAggregate(database),
      failureWindows: failureWindowProjection(
        database,
        runtime,
        clients,
        valid ? records[0].startedAt : null,
      ),
      unfinishedSamples: footer?.databaseIncomplete ?? null,
      missingWindows: missingDatabaseWindows,
    },
  };
  return validateCausalEvidence(result, {
    templates: [...templates],
    actors,
    phases,
  });
}
export function validateCausalEvidence(
  value,
  { templates = [], actors = [], phases = [] } = {},
) {
  exact(value, [
    'version',
    'quality',
    'reasons',
    'conservation',
    'requestGroups',
    'runtime',
    'database',
    ...(Object.hasOwn(value, 'tenantFailures') ? ['tenantFailures'] : []),
  ]);
  if (Object.hasOwn(value, 'tenantFailures'))
    validateTenantFailures(value.tenantFailures, { templates, actors, phases });
  if (
    value.version !== 1 ||
    !['partial', 'complete', 'incomplete'].includes(value.quality)
  )
    throw new Error('Invalid causal quality');
  exact(value.reasons, CAUSAL_REASONS);
  Object.values(value.reasons).forEach(safe);
  exact(value.conservation, [
    'clientAttempts',
    'serverAttempts',
    'matchedAttempts',
    'unmatchedServerAttempts',
    'classes',
  ]);
  exact(value.conservation.classes, CAUSAL_CLASSES);
  Object.values(value.conservation.classes).forEach(safe);
  for (const key of [
    'clientAttempts',
    'serverAttempts',
    'matchedAttempts',
    'unmatchedServerAttempts',
  ])
    safe(value.conservation[key]);
  if (
    Object.values(value.conservation.classes).reduce(
      (sum, n) => safe(sum + n),
      0,
    ) !== value.conservation.clientAttempts ||
    value.conservation.matchedAttempts +
      value.conservation.unmatchedServerAttempts !==
      value.conservation.serverAttempts
  )
    throw new Error('Invalid causal conservation');
  const validateRuntime = (r, overall = false) => {
    exact(r, [
      'measuredSamples',
      'maxTickLagMs',
      'maxEventLoopMaxMs',
      'maxEventLoopP99Ms',
      'maxCpuUserUs',
      'maxCpuSystemUs',
      'maxActiveRequests',
      ...(overall ? ['cpuUserUs', 'cpuSystemUs', 'missingWindows'] : []),
    ]);
    for (const item of Object.values(r)) if (item !== null) safe(item);
  };
  const validateDatabase = (d, overall = false) => {
    exact(d, [
      'measuredSamples',
      'failedSamples',
      'groups',
      ...(Object.hasOwn(d, 'lifecycleGroups') ||
      Object.hasOwn(d, 'lifecycleAvailable')
        ? ['lifecycleGroups', 'lifecycleAvailable']
        : []),
      ...(overall ? ['missingWindows'] : []),
      ...(overall && Object.hasOwn(d, 'failureWindows')
        ? ['failureWindows']
        : []),
      ...(Object.hasOwn(d, 'failureAttributionAvailable') ||
      Object.hasOwn(d, 'failureGroups')
        ? ['failureAttributionAvailable', 'failureGroups']
        : []),
      ...(overall && Object.hasOwn(d, 'unfinishedSamples')
        ? ['unfinishedSamples']
        : []),
    ]);
    safe(d.measuredSamples);
    safe(d.failedSamples);
    if (overall) safe(d.missingWindows);
    if (
      overall &&
      Object.hasOwn(d, 'unfinishedSamples') &&
      d.unfinishedSamples !== null &&
      ![0, 1].includes(d.unfinishedSamples)
    )
      throw new Error('Invalid unfinished database samples');
    if (Object.hasOwn(d, 'lifecycleGroups')) {
      if (
        typeof d.lifecycleAvailable !== 'boolean' ||
        !Array.isArray(d.lifecycleGroups) ||
        d.lifecycleGroups.length > 450
      )
        throw new Error('Invalid database lifecycle attribution');
      let total = 0,
        unavailable = false;
      const seen = new Set();
      for (const group of d.lifecycleGroups) {
        exact(group, [
          'outcome',
          'connectionStateAtStart',
          'generationBefore',
          'generationAfter',
          'samples',
        ]);
        if (
          !['success', 'error', 'timeout', 'busy'].includes(group.outcome) ||
          !CONNECTION_STATES.includes(group.connectionStateAtStart)
        )
          throw new Error('Invalid database lifecycle outcome');
        const legacy =
          group.generationBefore === null && group.generationAfter === null;
        if (legacy) {
          if (group.connectionStateAtStart !== 'unknown')
            throw new Error('Invalid legacy database lifecycle');
        } else {
          for (const key of ['generationBefore', 'generationAfter']) {
            safe(group[key]);
            if (group[key] > 450)
              throw new Error('Invalid database lifecycle generation');
          }
          if (
            group.generationAfter < group.generationBefore ||
            (group.connectionStateAtStart === 'initial' &&
              group.generationBefore !== 0) ||
            (['retained', 'reconnect'].includes(group.connectionStateAtStart) &&
              group.generationBefore === 0) ||
            (group.outcome === 'busy' &&
              group.connectionStateAtStart !== 'unknown')
          )
            throw new Error('Inconsistent database lifecycle generation');
        }
        unavailable ||= group.connectionStateAtStart === 'unknown';
        safe(group.samples);
        if (!group.samples) throw new Error('Empty database lifecycle group');
        total = safe(total + group.samples);
        const key = JSON.stringify([
          group.outcome,
          group.connectionStateAtStart,
          group.generationBefore,
          group.generationAfter,
        ]);
        if (seen.has(key))
          throw new Error('Duplicate database lifecycle group');
        seen.add(key);
      }
      if (
        total !== d.measuredSamples + d.failedSamples ||
        d.lifecycleAvailable === unavailable
      )
        throw new Error('Nonconserved database lifecycle attribution');
    }
    if (Object.hasOwn(d, 'failureGroups')) {
      if (
        typeof d.failureAttributionAvailable !== 'boolean' ||
        !Array.isArray(d.failureGroups) ||
        d.failureGroups.length > 256
      )
        throw new Error('Invalid database failure attribution');
      const seenFailures = new Set();
      let samples = 0,
        unavailable = false;
      for (const group of d.failureGroups) {
        exact(group, [
          'outcome',
          'category',
          'name',
          'code',
          'samples',
          'durationMs',
          'maxDurationMs',
        ]);
        if (!['error', 'timeout', 'busy'].includes(group.outcome))
          throw new Error('Invalid database failure outcome');
        if (group.category === 'unavailable') {
          if (group.name !== 'NONE' || group.code !== 'NONE')
            throw new Error('Invalid legacy database attribution');
          unavailable = true;
        } else
          validateDatabaseDiagnostic(
            { category: group.category, name: group.name, code: group.code },
            group.outcome,
          );
        const key = JSON.stringify([
          group.outcome,
          group.category,
          group.name,
          group.code,
        ]);
        if (seenFailures.has(key))
          throw new Error('Duplicate database failure attribution');
        seenFailures.add(key);
        safe(group.samples);
        safe(group.durationMs);
        safe(group.maxDurationMs);
        if (
          !group.samples ||
          group.maxDurationMs > group.durationMs ||
          group.durationMs > group.samples * group.maxDurationMs
        )
          throw new Error('Invalid database failure durations');
        samples = safe(samples + group.samples);
      }
      if (
        samples !== d.failedSamples ||
        d.failureAttributionAvailable === unavailable
      )
        throw new Error('Nonconserved database failure attribution');
    }
    if (!Array.isArray(d.groups) || d.groups.length > 72)
      throw new Error('Invalid causal database');
    const seen = new Set();
    for (const g of d.groups) {
      exact(g, [
        'state',
        'waitType',
        'maxSessions',
        'maxBlockedSessions',
        'maxActiveAgeMs',
      ]);
      if (
        !STATES.includes(g.state) ||
        !WAITS.includes(g.waitType) ||
        seen.has(`${g.state}/${g.waitType}`)
      )
        throw new Error('Invalid causal database group');
      seen.add(`${g.state}/${g.waitType}`);
      safe(g.maxSessions);
      safe(g.maxBlockedSessions);
      safe(g.maxActiveAgeMs);
    }
  };
  validateRuntime(value.runtime, true);
  validateDatabase(value.database, true);
  if (Object.hasOwn(value.database, 'failureWindows'))
    validateFailureWindows(
      value.database.failureWindows,
      value.database,
      value.conservation.clientAttempts,
    );
  if (
    !Array.isArray(value.requestGroups) ||
    value.requestGroups.length > value.conservation.clientAttempts
  )
    throw new Error('Invalid causal groups');
  let attempts = 0;
  const keys = new Set();
  for (const g of value.requestGroups) {
    exact(g, [
      'route',
      'actor',
      'phase',
      'method',
      'classification',
      'status',
      'attempts',
      'pipelineEntries',
      'finalizedEntries',
      'repeatedPipelineAttempts',
      'emittedEntries',
      'erroredEntries',
      'durations',
      'missingRuntimeWindows',
      'missingDatabaseWindows',
      'runtime',
      'database',
    ]);
    if (
      (g.route !== null && !templates.includes(g.route)) ||
      (!actors.includes(g.actor) && g.actor !== 'unknown') ||
      (!phases.includes(g.phase) && g.phase !== 'unknown') ||
      !METHODS.includes(g.method) ||
      !CAUSAL_CLASSES.includes(g.classification) ||
      (g.status !== null &&
        (!Number.isInteger(g.status) || g.status < 100 || g.status > 599))
    )
      throw new Error('Invalid causal group classification');
    const k = JSON.stringify([
      g.route,
      g.actor,
      g.phase,
      g.method,
      g.classification,
      g.status,
    ]);
    if (keys.has(k)) throw new Error('Duplicate causal group');
    keys.add(k);
    for (const name of [
      'attempts',
      'pipelineEntries',
      'finalizedEntries',
      'repeatedPipelineAttempts',
      'emittedEntries',
      'erroredEntries',
      'missingRuntimeWindows',
      'missingDatabaseWindows',
    ])
      safe(g[name]);
    attempts = safe(attempts + g.attempts);
    exact(g.durations, METRICS);
    for (const m of Object.values(g.durations)) {
      exact(m, ['measuredCount', 'sum', 'max']);
      safe(m.measuredCount);
      safe(m.sum);
      if (m.max !== null) safe(m.max);
      if ((m.measuredCount === 0) !== (m.max === null))
        throw new Error('Invalid causal duration');
    }
    validateRuntime(g.runtime);
    validateDatabase(g.database);
  }
  if (attempts !== value.conservation.clientAttempts)
    throw new Error('Causal attempt loss');
  return value;
}
export function collectCausalEvidence(report, directory, options = {}) {
  let records = [],
    readFailure = false,
    stopped = false;
  try {
    validateRunDirectory(directory);
    const text = readOwned(directory, 'api-observations.ndjson');
    if (!text.endsWith('\n') || Buffer.byteLength(text) > MAX_BYTES)
      throw new Error('Truncated observer stream');
    records = text
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (options.requireIsolated || records[0]?.databaseSampler) {
      const isolated = readIsolatedSampler(
        directory,
        Buffer.from(text),
        report.sourceSha,
        { final: options.final },
      );
      const apiProof = joinCausalEvidence(report, isolated.api, {
        ...options,
        stopped: true,
      });
      if (
        apiProof.reasons.invalidSchema ||
        apiProof.reasons.clockRegression ||
        apiProof.reasons.duplicateSequence ||
        apiProof.reasons.capacityExceeded
      )
        throw new Error('Invalid API producer');
      records = isolated.records;
    }
  } catch {
    readFailure = true;
  }
  if (options.final)
    try {
      stopped = readOwned(directory, 'api-stopped') === 'stopped\n';
    } catch {
      stopped = false;
    }
  const evidence = joinCausalEvidence(report, records, {
    ...options,
    readFailure,
    stopped,
  });
  return { records: evidence.reasons.invalidSchema ? [] : records, evidence };
}
