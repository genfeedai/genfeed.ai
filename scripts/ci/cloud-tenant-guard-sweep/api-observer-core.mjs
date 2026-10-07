export const OBSERVER_SYMBOL = Symbol.for(
  'genfeed.cloudTenantGuard.observer.v1',
);
export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_RECORDS = 100000;
export const STATES = [
  'active',
  'idle',
  'idle-in-transaction',
  'idle-in-transaction-aborted',
  'disabled',
  'other',
];
export const WAITS = [
  'none',
  'Activity',
  'BufferPin',
  'Client',
  'Extension',
  'IO',
  'IPC',
  'Lock',
  'LWLock',
  'Timeout',
  'InjectionPoint',
  'other',
];
export const DATABASE_QUERY =
  "SELECT state, wait_event_type, count(*)::int AS sessions, count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0)::int AS blocked_sessions, coalesce(max(CASE WHEN state = 'active' AND query_start IS NOT NULL THEN greatest(0, extract(epoch FROM clock_timestamp() - query_start) * 1000) ELSE 0 END), 0)::bigint AS active_age_ms FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() GROUP BY state, wait_event_type";
export const POOL_OPTIONS = {
  max: 1,
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 500,
  query_timeout: 750,
  statement_timeout: 500,
  allowExitOnIdle: true,
};
export const safe = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid observer number');
  return value;
};
const positive = (value) => {
  safe(value);
  if (!value) throw new Error('Invalid observer ordinal');
};
export const exact = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new Error('Invalid observer schema');
};
const shapes = {
  header: ['kind', 'protocol', 'startedAt'],
  ingress: ['kind', 'sequence', 'at'],
  pipelineEnter: ['kind', 'sequence', 'entry', 'at'],
  pipelineNext: ['kind', 'sequence', 'entry', 'at'],
  pipelineFinalize: ['kind', 'sequence', 'entry', 'at'],
  pipelineError: ['kind', 'sequence', 'entry', 'at', 'category', 'status'],
  finish: ['kind', 'sequence', 'at', 'status'],
  close: ['kind', 'sequence', 'at', 'headersSent', 'status'],
  runtime: [
    'kind',
    'start',
    'end',
    'tickLagMs',
    'eventLoopMaxMs',
    'eventLoopP99Ms',
    'cpuUserUs',
    'cpuSystemUs',
    'activeRequests',
    'observerWriteMaxUs',
  ],
  database: ['kind', 'start', 'end', 'outcome', 'groups'],
  footer: [
    'kind',
    'endedAt',
    'unavailable',
    'records',
    'ingress',
    'pipelineEntries',
    'finishes',
    'closes',
    'invalidSequences',
    'duplicateSequences',
    'runtimeSamples',
    'databaseSamples',
    'databaseIncomplete',
  ],
};
export function validateObservationRecord(record) {
  if (!shapes[record?.kind]) throw new Error('Invalid observer kind');
  exact(record, shapes[record.kind]);
  for (const key of ['at', 'startedAt', 'endedAt', 'start', 'end'])
    if (Object.hasOwn(record, key)) safe(record[key]);
  if (Object.hasOwn(record, 'start') && record.end < record.start)
    throw new Error('Observer clock regression');
  if (Object.hasOwn(record, 'sequence')) positive(record.sequence);
  if (Object.hasOwn(record, 'entry')) positive(record.entry);
  if (record.kind === 'header' && record.protocol !== 1)
    throw new Error('Invalid observer protocol');
  if (
    Object.hasOwn(record, 'status') &&
    record.status !== null &&
    (!Number.isInteger(record.status) ||
      record.status < 100 ||
      record.status > 599)
  )
    throw new Error('Invalid observer status');
  if (record.kind === 'finish' && record.status === null)
    throw new Error('Invalid observer finish');
  if (
    record.kind === 'close' &&
    (typeof record.headersSent !== 'boolean' ||
      (!record.headersSent && record.status !== null))
  )
    throw new Error('Invalid observer close');
  if (
    record.kind === 'pipelineError' &&
    !['timeout', 'database', 'http', 'other'].includes(record.category)
  )
    throw new Error('Invalid observer error');
  if (record.kind === 'runtime') {
    for (const key of shapes.runtime.filter(
      (key) => !['kind', 'eventLoopMaxMs', 'eventLoopP99Ms'].includes(key),
    ))
      safe(record[key]);
    for (const key of ['eventLoopMaxMs', 'eventLoopP99Ms'])
      if (record[key] !== null) safe(record[key]);
  }
  if (record.kind === 'database') {
    if (
      !['success', 'timeout', 'error', 'busy'].includes(record.outcome) ||
      !Array.isArray(record.groups) ||
      record.groups.length > 72 ||
      (record.outcome !== 'success' && record.groups.length)
    )
      throw new Error('Invalid database observation');
    const seen = new Set();
    for (const group of record.groups) {
      exact(group, [
        'state',
        'waitType',
        'sessions',
        'blockedSessions',
        'activeAgeMs',
      ]);
      if (
        !STATES.includes(group.state) ||
        !WAITS.includes(group.waitType) ||
        seen.has(`${group.state}/${group.waitType}`)
      )
        throw new Error('Invalid database classification');
      seen.add(`${group.state}/${group.waitType}`);
      safe(group.sessions);
      safe(group.blockedSessions);
      safe(group.activeAgeMs);
      if (group.blockedSessions > group.sessions)
        throw new Error('Invalid blocked count');
    }
  }
  if (record.kind === 'footer') {
    if (typeof record.unavailable !== 'boolean')
      throw new Error('Invalid footer availability');
    for (const key of shapes.footer.filter(
      (key) => !['kind', 'unavailable'].includes(key),
    ))
      safe(record[key]);
    if (record.runtimeSamples > 900 || record.databaseSamples > 450)
      throw new Error('Observer capacity exceeded');
  }
  return record;
}
export function normalizeDatabaseRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid database rows');
  const groups = new Map();
  for (const row of rows) {
    const state = STATES.includes(String(row.state).replaceAll(' ', '-'))
      ? String(row.state).replaceAll(' ', '-')
      : 'other';
    const waitType =
      row.wait_event_type === null
        ? 'none'
        : WAITS.includes(row.wait_event_type)
          ? row.wait_event_type
          : 'other';
    const key = `${state}/${waitType}`;
    if (groups.has(key)) throw new Error('Duplicate database pair');
    const integer = (value) => {
      if (
        typeof value !== 'number' &&
        (typeof value !== 'string' || !/^\d+$/.test(value))
      )
        throw new Error('Invalid database integer');
      return safe(Number(value));
    };
    const group = groups.get(key) ?? {
      state,
      waitType,
      sessions: 0,
      blockedSessions: 0,
      activeAgeMs: 0,
    };
    group.sessions = safe(group.sessions + integer(row.sessions));
    group.blockedSessions = safe(
      group.blockedSessions + integer(row.blocked_sessions),
    );
    group.activeAgeMs = Math.max(group.activeAgeMs, integer(row.active_age_ms));
    groups.set(key, group);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
}
export function createApiObserver({
  write,
  close = () => {},
  now = Date.now,
  pool,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  monitor,
  cpuUsage = process.cpuUsage,
  hrtime = () => process.hrtime.bigint(),
  maxBytes = MAX_BYTES,
  maxRecords = MAX_RECORDS,
}) {
  const counts = {
    records: 0,
    ingress: 0,
    pipelineEntries: 0,
    finishes: 0,
    closes: 0,
    invalidSequences: 0,
    duplicateSequences: 0,
    runtimeSamples: 0,
    databaseSamples: 0,
    databaseIncomplete: 0,
  };
  const requests = new WeakMap(),
    sequences = new Set(),
    active = new Set();
  let unavailable = false,
    bytes = 0,
    stopped = false,
    busy = false,
    last = now(),
    lastRuntime = last,
    writeMax = 0,
    cpu = cpuUsage();
  const mark = () => {
    unavailable = true;
  };
  const emit = (record, footer = false) => {
    try {
      validateObservationRecord(record);
      const at = record.at ?? record.end ?? record.startedAt ?? record.endedAt;
      if (at < last) throw new Error('Observer clock regression');
      last = at;
      const line = `${JSON.stringify(record)}\n`;
      if (
        bytes + Buffer.byteLength(line) > maxBytes ||
        (!footer && counts.records >= maxRecords - 1)
      ) {
        mark();
        return;
      }
      const start = hrtime();
      write(line);
      const elapsed = safe(Math.round(Number(hrtime() - start) / 1000));
      writeMax = Math.max(writeMax, elapsed);
      bytes += Buffer.byteLength(line);
      if (!footer) counts.records++;
    } catch {
      mark();
    }
  };
  emit({ kind: 'header', protocol: 1, startedAt: last });
  const guard = (run) => {
    try {
      if (!stopped) return run();
    } catch {
      mark();
    }
    return undefined;
  };
  const event = (request, kind, entry, error) =>
    guard(() => {
      const state = requests.get(request);
      if (!state) return;
      if (!state.entries.has(entry) || state.finalized.has(entry)) {
        mark();
        return;
      }
      const record = { kind, sequence: state.sequence, entry, at: now() };
      if (kind === 'pipelineError') {
        const name = typeof error?.name === 'string' ? error.name : '';
        record.category = ['RequestTimeoutException', 'TimeoutError'].includes(
          name,
        )
          ? 'timeout'
          : name.startsWith('PrismaClient')
            ? 'database'
            : typeof error?.getStatus === 'function'
              ? 'http'
              : 'other';
        const status =
          typeof error?.getStatus === 'function' ? error.getStatus() : null;
        record.status =
          Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : null;
      }
      if (kind === 'pipelineFinalize') state.finalized.add(entry);
      emit(record);
    });
  const observer = {
    protocol: 1,
    unavailable: mark,
    ingress: (request, response) =>
      guard(() => {
        const header = request.headers['x-genfeed-ci-attempt'];
        if (header === undefined) return;
        if (
          typeof header !== 'string' ||
          !/^[1-9][0-9]*$/.test(header) ||
          !Number.isSafeInteger(Number(header))
        ) {
          counts.invalidSequences++;
          mark();
          return;
        }
        const sequence = Number(header);
        if (sequences.has(sequence)) {
          counts.duplicateSequences++;
          mark();
          return;
        }
        sequences.add(sequence);
        counts.ingress++;
        active.add(sequence);
        requests.set(request, {
          sequence,
          entries: new Set(),
          finalized: new Set(),
        });
        emit({ kind: 'ingress', sequence, at: now() });
        response.once('finish', () =>
          guard(() => {
            counts.finishes++;
            active.delete(sequence);
            emit({
              kind: 'finish',
              sequence,
              at: now(),
              status: response.statusCode,
            });
          }),
        );
        response.once('close', () =>
          guard(() => {
            counts.closes++;
            active.delete(sequence);
            emit({
              kind: 'close',
              sequence,
              at: now(),
              headersSent: response.headersSent,
              status: response.headersSent ? response.statusCode : null,
            });
          }),
        );
      }),
    pipelineEnter: (request) =>
      guard(() => {
        const state = requests.get(request);
        if (!state) return;
        const entry = state.entries.size + 1;
        state.entries.add(entry);
        counts.pipelineEntries++;
        emit({
          kind: 'pipelineEnter',
          sequence: state.sequence,
          entry,
          at: now(),
        });
        return entry;
      }),
    pipelineNext: (request, entry) => event(request, 'pipelineNext', entry),
    pipelineError: (request, entry, error) =>
      event(request, 'pipelineError', entry, error),
    pipelineFinalize: (request, entry) =>
      event(request, 'pipelineFinalize', entry),
  };
  monitor?.enable();
  const runtimeTick = () =>
    guard(() => {
      if (counts.runtimeSamples >= 900) {
        mark();
        return;
      }
      const end = now(),
        usage = cpuUsage();
      const measurement = (value) =>
        Number.isFinite(value) && value >= 0
          ? safe(Math.round(value / 1e6))
          : null;
      const record = {
        kind: 'runtime',
        start: lastRuntime,
        end,
        tickLagMs: Math.max(0, end - lastRuntime - 1000),
        eventLoopMaxMs: measurement(monitor?.max),
        eventLoopP99Ms: measurement(monitor?.percentile(99)),
        cpuUserUs: safe(usage.user - cpu.user),
        cpuSystemUs: safe(usage.system - cpu.system),
        activeRequests: active.size,
        observerWriteMaxUs: writeMax,
      };
      cpu = usage;
      lastRuntime = end;
      writeMax = 0;
      monitor?.reset();
      counts.runtimeSamples++;
      emit(record);
    });
  const databaseTick = () =>
    guard(() => {
      if (counts.databaseSamples >= 450) {
        mark();
        return;
      }
      const start = now();
      if (busy) {
        counts.databaseSamples++;
        emit({
          kind: 'database',
          start,
          end: start,
          outcome: 'busy',
          groups: [],
        });
        return;
      }
      busy = true;
      Promise.resolve()
        .then(() => pool.query(DATABASE_QUERY))
        .then(
          ({ rows }) => ({
            outcome: 'success',
            groups: normalizeDatabaseRows(rows),
          }),
          (error) => ({
            outcome:
              error?.name === 'TimeoutError' || error?.code === '57014'
                ? 'timeout'
                : 'error',
            groups: [],
          }),
        )
        .then((result) => {
          if (stopped) return;
          counts.databaseSamples++;
          emit({ kind: 'database', start, end: now(), ...result });
        })
        .catch(mark)
        .finally(() => {
          busy = false;
        });
    });
  const timers = [
    setIntervalImpl(runtimeTick, 1000),
    setIntervalImpl(databaseTick, 2000),
  ];
  for (const timer of timers) timer?.unref?.();
  return {
    observer,
    runtimeTick,
    databaseTick,
    stop: () => {
      if (stopped) return;
      for (const timer of timers) clearIntervalImpl(timer);
      monitor?.disable();
      if (busy) counts.databaseIncomplete = 1;
      try {
        pool?.end()?.catch?.(mark);
      } catch {
        mark();
      }
      emit({ kind: 'footer', endedAt: now(), unavailable, ...counts }, true);
      stopped = true;
      try {
        close();
      } catch {
        mark();
      }
    },
  };
}
