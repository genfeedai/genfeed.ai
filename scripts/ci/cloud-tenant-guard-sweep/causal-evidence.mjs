import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  exact,
  MAX_BYTES,
  MAX_RECORDS,
  STATES,
  safe,
  validateObservationRecord,
  WAITS,
} from './api-observer-core.mjs';
import { validateRunDirectory } from './local-mail-stub.mjs';
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
  return {
    measuredSamples: samples.filter((s) => s.outcome === 'success').length,
    failedSamples: samples.filter((s) => s.outcome !== 'success').length,
    groups: [...groups]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, g]) => g),
  };
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
    (sample) => sample.outcome !== 'success',
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
    runtime: {
      ...runtimeAggregate(runtime),
      cpuUserUs: runtime.reduce((sum, s) => safe(sum + s.cpuUserUs), 0),
      cpuSystemUs: runtime.reduce((sum, s) => safe(sum + s.cpuSystemUs), 0),
      missingWindows: missingRuntimeWindows,
    },
    database: {
      ...databaseAggregate(database),
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
  ]);
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
      ...(overall ? ['missingWindows'] : []),
    ]);
    safe(d.measuredSamples);
    safe(d.failedSamples);
    if (overall) safe(d.missingWindows);
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
  return { records, evidence };
}
