import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApiObserver } from './api-observer-core.mjs';
import {
  collectCausalEvidence,
  joinCausalEvidence,
  validateCausalEvidence,
} from './causal-evidence.mjs';

const options = {
  final: true,
  stopped: true,
  actors: ['M:A'],
  phases: ['memberAGets'],
};
function fixture() {
  const records = [{ kind: 'header', protocol: 1, startedAt: 100 }];
  const requests = [];
  const inventoryTemplates = ['/v1/fixed/{id}'];
  const add = (sequence, kind) => {
    requests.push({
      sequence,
      sentAtEpochMs: 100,
      headerAtEpochMs: null,
      endedAtEpochMs: 200,
      route: inventoryTemplates[0],
      actor: 'M:A',
      sweepPhase: 'memberAGets',
      method: 'GET',
      queueWaitMs: 0,
      headerMs: 100,
      bodyMs: 0,
      totalMs: 100,
    });
    if (kind === 'noIngress') return;
    records.push({ kind: 'ingress', sequence, at: 110 });
    if (!kind.includes('Before')) {
      records.push(
        { kind: 'pipelineEnter', sequence, entry: 1, at: 120 },
        { kind: 'pipelineNext', sequence, entry: 1, at: 125 },
        { kind: 'pipelineFinalize', sequence, entry: 1, at: 130 },
      );
    }
    if (kind.startsWith('finished'))
      records.push({
        kind: 'finish',
        sequence,
        at: 140,
        status:
          kind === 'finished408'
            ? 408
            : kind === 'finishedOtherFailure'
              ? 503
              : 200,
      });
    if (kind.startsWith('closed'))
      records.push({
        kind: 'close',
        sequence,
        at: 140,
        headersSent: false,
        status: null,
      });
  };
  for (const [i, kind] of [
    'noIngress',
    'finished408',
    'finishedOtherFailure',
    'finishedSuccess',
    'closedBeforePipeline',
    'closedAfterPipeline',
    'openBeforePipeline',
    'openAfterPipeline',
  ].entries())
    add(i + 1, kind);
  records.splice(
    1,
    records.length - 1,
    ...records.slice(1).sort((a, b) => a.at - b.at),
  );
  records.push(
    {
      kind: 'runtime',
      start: 100,
      end: 200,
      tickLagMs: 0,
      eventLoopMaxMs: 1,
      eventLoopP99Ms: 1,
      cpuUserUs: 10,
      cpuSystemUs: 5,
      activeRequests: 7,
      observerWriteMaxUs: 0,
    },
    {
      kind: 'database',
      start: 150,
      end: 200,
      outcome: 'success',
      groups: [
        {
          state: 'active',
          waitType: 'Lock',
          sessions: 2,
          blockedSessions: 1,
          activeAgeMs: 50,
        },
      ],
    },
  );
  const footer = {
    kind: 'footer',
    endedAt: 210,
    unavailable: false,
    records: records.length,
    ingress: 7,
    pipelineEntries: 5,
    finishes: 3,
    closes: 2,
    invalidSequences: 0,
    duplicateSequences: 0,
    runtimeSamples: 1,
    databaseSamples: 1,
    databaseIncomplete: 0,
  };
  records.push(footer);
  return { report: { requests, inventoryTemplates }, records };
}
test('every native response/open/close/no-ingress class conserves exactly one client attempt', () => {
  const f = fixture();
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.equal(e.quality, 'complete');
  for (const [kind, count] of Object.entries(e.conservation.classes))
    assert.equal(count, kind === 'telemetryIncomplete' ? 0 : 1);
  assert.equal(e.conservation.clientAttempts, 8);
  assert.equal(e.runtime.cpuUserUs, 10);
  assert.equal(
    e.requestGroups.reduce((sum, g) => sum + g.attempts, 0),
    8,
  );
  assert.equal(e.requestGroups[0].database.groups[0].maxBlockedSessions, 1);
  assert.equal(JSON.stringify(e).includes('sequence'), false);
  assert.equal(JSON.stringify(e).includes('startedAt'), false);
  validateCausalEvidence(e, {
    templates: f.report.inventoryTemplates,
    actors: options.actors,
    phases: options.phases,
  });
});
test('partial then final snapshots cannot invent no-ingress from missing telemetry', () => {
  const f = fixture();
  f.records.pop();
  const partial = joinCausalEvidence(f.report, f.records, {
    ...options,
    final: false,
    stopped: false,
  });
  assert.equal(partial.quality, 'partial');
  assert.equal(partial.conservation.classes.telemetryIncomplete, 8);
  const final = joinCausalEvidence(f.report, f.records, {
    ...options,
    stopped: false,
  });
  assert.equal(final.quality, 'incomplete');
  assert.equal(final.reasons.missingFooter, 1);
  assert.equal(final.reasons.missingStop, 1);
});
test('malformed fields, clock regression, duplicate events and counter mismatch fail conserved evidence closed', () => {
  for (const mutate of [
    (r) => {
      r[1].extra = 'private';
    },
    (r) => {
      r[1].at = 0;
    },
    (r) => {
      r.push(r.at(-1));
    },
    (r) => {
      r.at(-1).ingress++;
    },
    (r) => {
      r.splice(2, 0, { ...r[1] });
    },
    (r) => {
      r[1].sequence = 0;
    },
  ]) {
    const f = fixture();
    mutate(f.records);
    const e = joinCausalEvidence(f.report, f.records, options);
    assert.equal(e.quality, 'incomplete');
    assert.equal(e.conservation.classes.telemetryIncomplete, 8);
    assert.equal(JSON.stringify(e).includes('private'), false);
  }
});
test('missing/duplicate client identity and unmatched server requests are never no-ingress', () => {
  for (const mutate of [
    (f) => {
      delete f.report.requests[0].sequence;
    },
    (f) => {
      f.report.requests[0].sequence = 2;
    },
    (f) => {
      f.report.requests.pop();
    },
  ]) {
    const f = fixture();
    mutate(f);
    const e = joinCausalEvidence(f.report, f.records, options);
    assert.equal(e.quality, 'incomplete');
    assert.equal(e.conservation.classes.noIngress, 0);
    assert.equal(
      e.conservation.classes.telemetryIncomplete,
      f.report.requests.length,
    );
  }
});
test('noninventory and unknown actor/phase/method never leak private values; maxima stay null for unmeasured data', () => {
  const f = fixture();
  Object.assign(f.report.requests[0], {
    route: '/private-id?private-query',
    actor: 'private-user',
    sweepPhase: 'private-phase',
    method: 'private-method',
    body: 'private-body',
    token: 'private-token',
  });
  delete f.report.requests[0].queueWaitMs;
  const e = joinCausalEvidence(f.report, f.records, options);
  const g = e.requestGroups.find((g) => g.route === null);
  assert.equal(g.actor, 'unknown');
  assert.equal(g.phase, 'unknown');
  assert.equal(g.method, 'other');
  assert.equal(g.durations.queueWaitMs.max, null);
  assert.equal(g.durations.queueWaitMs.measuredCount, 0);
  for (const s of [
    'private-id',
    'private-query',
    'private-user',
    'private-phase',
    'private-method',
    'private-body',
    'private-token',
    'SELECT',
    'stack',
  ])
    assert.equal(JSON.stringify(e).includes(s), false);
});
test('observer/sampler unavailable reasons remain fixed and sample gaps stay unknown', () => {
  const f = fixture();
  f.records.at(-1).unavailable = true;
  f.records.at(-1).databaseIncomplete = 1;
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.equal(e.quality, 'incomplete');
  assert.equal(e.reasons.observerUnavailable, 1);
  assert.equal(e.reasons.samplerFailure, 1);
});
test('owned file collection rejects symlinks, modes and truncation while retaining safe incomplete counts', (context) => {
  const dir = mkdtempSync(join(tmpdir(), 'causal-owned-'));
  chmodSync(dir, 0o700);
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = fixture();
  const path = join(dir, 'api-observations.ndjson');
  writeFileSync(
    path,
    `${f.records.map((r) => JSON.stringify(r)).join('\n')}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(dir, 'api-stopped'), 'stopped\n', { mode: 0o600 });
  assert.equal(
    collectCausalEvidence(f.report, dir, options).evidence.quality,
    'complete',
  );
  const unsafe = f.records.map((record) => ({ ...record }));
  unsafe[1].private = 'private-token';
  writeFileSync(
    path,
    `${unsafe.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
  assert.deepEqual(collectCausalEvidence(f.report, dir, options).records, []);
  writeFileSync(
    path,
    `${f.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
  chmodSync(path, 0o644);
  assert.equal(
    collectCausalEvidence(f.report, dir, options).evidence.quality,
    'incomplete',
  );
  chmodSync(path, 0o600);
  writeFileSync(path, '{');
  assert.equal(
    collectCausalEvidence(f.report, dir, options).evidence.quality,
    'incomplete',
  );
  rmSync(path);
  symlinkSync(join(dir, 'api-stopped'), path);
  assert.equal(
    collectCausalEvidence(f.report, dir, options).evidence.quality,
    'incomplete',
  );
});
test('same observer lifecycle and sampler records feed the joiner, preserving re-entry/emission/finalization', () => {
  let at = 100;
  const records = [];
  const instance = createApiObserver({
    write: (line) => records.push(JSON.parse(line)),
    now: () => at,
    pool: Object.assign(new EventEmitter(), { end: () => Promise.resolve() }),
    setIntervalImpl: () => ({ unref() {} }),
    clearIntervalImpl() {},
    cpuUsage: () => ({ user: 0, system: 0 }),
    hrtime: () => 0n,
  });
  const req = { headers: { 'x-genfeed-ci-attempt': '1' } },
    listeners = {};
  const res = {
    statusCode: 200,
    headersSent: true,
    once: (name, fn) => {
      listeners[name] = fn;
    },
  };
  instance.observer.ingress(req, res);
  at = 110;
  for (let i = 0; i < 2; i++) {
    const entry = instance.observer.pipelineEnter(req);
    instance.observer.pipelineNext(req, entry);
    instance.observer.pipelineNext(req, entry);
    instance.observer.pipelineFinalize(req, entry);
  }
  at = 120;
  listeners.finish();
  listeners.close();
  at = 130;
  instance.stop();
  const e = joinCausalEvidence(
    {
      inventoryTemplates: ['/v1/fixed'],
      requests: [
        {
          sequence: 1,
          sentAtEpochMs: 100,
          headerAtEpochMs: 120,
          endedAtEpochMs: 120,
          route: '/v1/fixed',
          actor: 'M:A',
          phase: 'memberAGets',
          method: 'GET',
        },
      ],
    },
    records,
    options,
  );
  assert.equal(e.quality, 'complete');
  assert.equal(e.requestGroups[0].pipelineEntries, 2);
  assert.equal(e.requestGroups[0].finalizedEntries, 2);
  assert.equal(e.requestGroups[0].emittedEntries, 2);
  assert.equal(e.requestGroups[0].repeatedPipelineAttempts, 1);
  assert.equal(e.runtime.measuredSamples, 0);
  assert.equal(e.runtime.maxEventLoopMaxMs, null);
});

test('database failure groups conserve native/legacy samples and overlapping windows without changing fatality', () => {
  const f = fixture();
  const samples = [
    {
      kind: 'database',
      start: 150,
      end: 200,
      outcome: 'error',
      groups: [],
      diagnostic: {
        category: 'query-read-timeout',
        name: 'Error',
        code: 'NONE',
      },
    },
    {
      kind: 'database',
      start: 160,
      end: 200,
      outcome: 'timeout',
      groups: [],
      diagnostic: { category: 'query-canceled', name: 'Error', code: '57014' },
    },
    { kind: 'database', start: 170, end: 200, outcome: 'error', groups: [] },
    {
      kind: 'database',
      start: 200,
      end: 200,
      outcome: 'busy',
      groups: [],
      diagnostic: { category: 'busy', name: 'NONE', code: 'NONE' },
    },
  ];
  f.records.splice(-1, 0, ...samples);
  const footer = f.records.at(-1);
  footer.records = f.records.length - 1;
  footer.databaseSamples = 5;
  footer.databaseIncomplete = 1;
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.equal(e.quality, 'incomplete');
  assert.equal(e.reasons.samplerFailure, 5);
  assert.equal(e.database.failedSamples, 4);
  assert.equal(e.database.failureAttributionAvailable, false);
  assert.equal(e.database.unfinishedSamples, 1);
  assert.equal(
    e.database.failureGroups.reduce((n, g) => n + g.samples, 0),
    4,
  );
  assert.equal(
    e.database.failureGroups.reduce((n, g) => n + g.durationMs, 0),
    120,
  );
  assert.equal(
    e.database.failureGroups.find((g) => g.category === 'unavailable').name,
    'NONE',
  );
  assert.ok(
    e.requestGroups
      .filter((g) => g.database.failedSamples)
      .every(
        (g) =>
          g.database.failureGroups.reduce((n, x) => n + x.samples, 0) ===
          g.database.failedSamples,
      ),
  );
  assert.doesNotMatch(JSON.stringify(e.database), /sequence|"start"|"end"|SQL/);
  validateCausalEvidence(e, {
    templates: f.report.inventoryTemplates,
    actors: options.actors,
    phases: options.phases,
  });
  const legacy = structuredClone(e);
  delete legacy.database.failureWindows;
  delete legacy.database.failureAttributionAvailable;
  delete legacy.database.failureGroups;
  delete legacy.database.unfinishedSamples;
  for (const g of legacy.requestGroups) {
    delete g.database.failureAttributionAvailable;
    delete g.database.failureGroups;
  }
  validateCausalEvidence(legacy, {
    templates: f.report.inventoryTemplates,
    actors: options.actors,
    phases: options.phases,
  });
  for (const change of [
    (d) => d.failureGroups[0].samples++,
    (d) => (d.failureGroups[0].durationMs = -1),
    (d) => (d.failureGroups[0].maxDurationMs = Number.MAX_SAFE_INTEGER),
    (d) => (d.failureAttributionAvailable = true),
    (d) => (d.unfinishedSamples = 2),
    (d) => (d.failureGroups[0].sql = 'canary'),
    (d) => delete d.failureAttributionAvailable,
  ]) {
    const bad = structuredClone(e);
    change(bad.database);
    assert.throws(() =>
      validateCausalEvidence(bad, {
        templates: f.report.inventoryTemplates,
        actors: options.actors,
        phases: options.phases,
      }),
    );
  }
});
test('new zero-failure database attribution is available and unfinished footer absence stays null', () => {
  const f = fixture();
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.equal(e.database.failureAttributionAvailable, true);
  assert.deepEqual(e.database.failureGroups, []);
  assert.equal(e.database.unfinishedSamples, 0);
  f.records.pop();
  assert.equal(
    joinCausalEvidence(f.report, f.records, options).database.unfinishedSamples,
    null,
  );
});

test('new lifecycle outcomes conserve every sample with legacy unknown/unavailable and strict current quality', () => {
  const f = fixture();
  const db = f.records.find((r) => r.kind === 'database');
  Object.assign(db, {
    connectionStateAtStart: 'initial',
    connectionGenerationBefore: 0,
    connectionGenerationAfter: 1,
  });
  const evidence = joinCausalEvidence(f.report, f.records, options);
  assert.equal(evidence.database.lifecycleAvailable, true);
  assert.equal(
    evidence.database.lifecycleGroups.reduce((sum, g) => sum + g.samples, 0),
    evidence.database.measuredSamples + evidence.database.failedSamples,
  );
  validateCausalEvidence(evidence, {
    templates: f.report.inventoryTemplates,
    actors: options.actors,
    phases: options.phases,
  });
  for (const change of [
    (d) => d.lifecycleGroups[0].samples++,
    (d) => (d.lifecycleGroups[0].generationAfter = 451),
    (d) => (d.lifecycleGroups[0].generationBefore = 2),
    (d) => (d.lifecycleGroups[0].sql = 'private-canary'),
    (d) => d.lifecycleGroups.push({ ...d.lifecycleGroups[0] }),
    (d) => (d.lifecycleGroups[0].connectionStateAtStart = 'host-canary'),
    (d) => delete d.lifecycleAvailable,
  ]) {
    const bad = structuredClone(evidence);
    change(bad.database);
    assert.throws(() =>
      validateCausalEvidence(bad, {
        templates: f.report.inventoryTemplates,
        actors: options.actors,
        phases: options.phases,
      }),
    );
  }
  delete db.connectionStateAtStart;
  delete db.connectionGenerationBefore;
  delete db.connectionGenerationAfter;
  const historical = joinCausalEvidence(f.report, f.records, options);
  assert.equal(historical.database.lifecycleAvailable, false);
  assert.equal(
    historical.database.lifecycleGroups[0].connectionStateAtStart,
    'unknown',
  );
  assert.equal(historical.database.lifecycleGroups[0].generationBefore, null);
  f.report.machineCoverageRequired = true;
  const current = joinCausalEvidence(f.report, f.records, options);
  assert.equal(current.quality, 'incomplete');
  assert.ok(current.reasons.samplerFailure > 0);
});

function temporalFixture(intervals = [[2000, 2200]]) {
  const report = {
    inventoryTemplates: ['/v1/fixed'],
    requests: intervals.map(([start, end], index) => ({
      sequence: index + 1,
      sentAtEpochMs: start,
      headerAtEpochMs: null,
      endedAtEpochMs: end,
      route: '/v1/fixed',
      actor: 'M:A',
      phase: 'memberAGets',
      method: 'GET',
    })),
  };
  const runtime = (start, end, lag) => ({
    kind: 'runtime',
    start,
    end,
    tickLagMs: lag,
    eventLoopMaxMs: lag,
    eventLoopP99Ms: lag,
    cpuUserUs: 0,
    cpuSystemUs: 0,
    activeRequests: 0,
    observerWriteMaxUs: 0,
  });
  const records = [
    { kind: 'header', protocol: 1, startedAt: 100 },
    runtime(400, 900, 3),
    {
      kind: 'database',
      start: 500,
      end: 1329,
      outcome: 'error',
      groups: [],
      diagnostic: {
        category: 'query-read-timeout',
        name: 'Error',
        code: 'NONE',
      },
      connectionStateAtStart: 'retained',
      connectionGenerationBefore: 1,
      connectionGenerationAfter: 1,
    },
    runtime(900, 1400, 4),
    runtime(1600, 1900, 9999),
    {
      kind: 'footer',
      endedAt: 2300,
      unavailable: false,
      records: 5,
      ingress: 0,
      pipelineEntries: 0,
      finishes: 0,
      closes: 0,
      invalidSequences: 0,
      duplicateSequences: 0,
      runtimeSamples: 3,
      databaseSamples: 1,
      databaseIncomplete: 0,
    },
  ];
  return { report, records };
}
function validateTemporal(e) {
  return validateCausalEvidence(e, {
    templates: ['/v1/fixed'],
    actors: options.actors,
    phases: options.phases,
  });
}
test('real NDJSON retains the before-first failed window and only its overlapping runtime records', (context) => {
  const f = temporalFixture();
  const directory = mkdtempSync(join(tmpdir(), 'tenant-failure-windows-'));
  chmodSync(directory, 0o700);
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, 'api-observations.ndjson'),
    `${f.records.map((r) => JSON.stringify(r)).join('\n')}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(directory, 'api-stopped'), 'stopped\n', { mode: 0o600 });
  const { evidence: e } = collectCausalEvidence(f.report, directory, options);
  assert.equal(e.quality, 'incomplete');
  assert.equal(e.reasons.samplerFailure, 1);
  assert.deepEqual(e.database.failureWindows, {
    version: 1,
    available: true,
    firstClientStartOffsetMs: 1900,
    lastClientEndOffsetMs: 2100,
    windows: [
      {
        observationOrdinal: 1,
        startOffsetMs: 400,
        endOffsetMs: 1229,
        durationMs: 829,
        outcome: 'error',
        category: 'query-read-timeout',
        name: 'Error',
        code: 'NONE',
        connectionStateAtStart: 'retained',
        generationBefore: 1,
        generationAfter: 1,
        relation: 'before-first-instrumented-attempt',
        overlappingClientAttempts: 0,
        runtimeWindowOrdinals: [1, 2],
      },
    ],
    runtimeWindows: [
      {
        ordinal: 1,
        startOffsetMs: 300,
        endOffsetMs: 800,
        tickLagMs: 3,
        eventLoopMaxMs: 3,
        eventLoopP99Ms: 3,
      },
      {
        ordinal: 2,
        startOffsetMs: 800,
        endOffsetMs: 1300,
        tickLagMs: 4,
        eventLoopMaxMs: 4,
        eventLoopP99Ms: 4,
      },
    ],
  });
  assert.equal(
    Object.hasOwn(e.requestGroups[0].database, 'failureWindows'),
    false,
  );
  assert.equal(
    JSON.stringify(e.database.failureWindows).includes('9999'),
    false,
  );
  validateTemporal(e);
});
for (const [intervals, relation, overlaps] of [
  [[[1329, 1500]], 'overlaps-instrumented-attempt', 1],
  [[[300, 500]], 'overlaps-instrumented-attempt', 1],
  [
    [
      [600, 700],
      [800, 900],
    ],
    'overlaps-instrumented-attempt',
    2,
  ],
  [[[100, 499]], 'after-last-instrumented-attempt', 0],
  [
    [
      [100, 499],
      [1330, 1400],
    ],
    'between-instrumented-attempts',
    0,
  ],
])
  test(`failure temporal relation ${relation} ${JSON.stringify(intervals)} uses inclusive actual intervals`, () => {
    const f = temporalFixture(intervals);
    const e = joinCausalEvidence(f.report, f.records, options);
    assert.equal(e.database.failureWindows.windows[0].relation, relation);
    assert.equal(
      e.database.failureWindows.windows[0].overlappingClientAttempts,
      overlaps,
    );
    validateTemporal(e);
  });
test('missing client clocks stay unavailable while independently known failed sample times remain exact', () => {
  for (const mutate of [
    (f) => {
      f.report.requests = [];
    },
    (f) => {
      delete f.report.requests[0].sentAtEpochMs;
    },
    (f) => {
      f.report.requests[0].endedAtEpochMs = 1;
    },
  ]) {
    const f = temporalFixture();
    mutate(f);
    const e = joinCausalEvidence(f.report, f.records, options);
    const p = e.database.failureWindows;
    assert.equal(p.available, false);
    assert.equal(p.firstClientStartOffsetMs, null);
    assert.equal(p.lastClientEndOffsetMs, null);
    assert.equal(p.windows[0].startOffsetMs, 400);
    assert.equal(p.windows[0].durationMs, 829);
    assert.equal(p.windows[0].relation, 'unavailable');
    assert.equal(p.windows[0].overlappingClientAttempts, null);
    assert.deepEqual(p.windows[0].runtimeWindowOrdinals, [1, 2]);
    validateTemporal(e);
  }
});
test('historical temporal absence remains readable and legacy lifecycle/diagnostic fields remain unknown', () => {
  const f = temporalFixture();
  delete f.records[2].diagnostic;
  delete f.records[2].connectionStateAtStart;
  delete f.records[2].connectionGenerationBefore;
  delete f.records[2].connectionGenerationAfter;
  const e = joinCausalEvidence(f.report, f.records, options);
  const window = e.database.failureWindows.windows[0];
  assert.equal(window.category, 'unavailable');
  assert.equal(window.name, 'NONE');
  assert.equal(window.code, 'NONE');
  assert.equal(window.connectionStateAtStart, 'unknown');
  assert.equal(window.generationBefore, null);
  assert.equal(window.generationAfter, null);
  delete e.database.failureWindows;
  validateTemporal(e);
});
test('temporal projection rejects privacy, partial versions, bounds, references and nonconserved tuples', () => {
  const f = temporalFixture();
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.ok(e.database.failureWindows);
  for (const mutate of [
    (p) => {
      p.version = 2;
    },
    (p) => {
      delete p.available;
    },
    (p) => {
      p.token = 'privacy-canary';
    },
    (p) => {
      p.windows[0].sql = 'privacy-canary';
    },
    (p) => {
      p.windows[0].observationOrdinal = 0;
    },
    (p) => {
      p.windows[0].observationOrdinal = 2;
    },
    (p) => {
      p.windows[0].startOffsetMs = -1;
    },
    (p) => {
      p.windows[0].endOffsetMs++;
    },
    (p) => {
      p.windows[0].durationMs++;
    },
    (p) => {
      p.windows[0].code = 'private-code';
    },
    (p) => {
      p.windows[0].generationAfter = 451;
    },
    (p) => {
      p.windows[0].runtimeWindowOrdinals = [1, 1];
    },
    (p) => {
      p.windows[0].runtimeWindowOrdinals = [3];
    },
    (p) => {
      p.runtimeWindows[0].startOffsetMs = 2000;
      p.runtimeWindows[0].endOffsetMs = 2100;
    },
    (p) => {
      p.runtimeWindows.push({ ...p.runtimeWindows[0], ordinal: 3 });
    },
    (p) => {
      p.runtimeWindows[0].ordinal = 0;
    },
    (p) => {
      p.windows[0].relation = 'boot';
    },
    (p) => {
      p.windows[0].overlappingClientAttempts = 1;
    },
    (p) => {
      p.firstClientStartOffsetMs = 1;
    },
    (p) => {
      p.windows = [];
    },
    (p) => {
      p.available = false;
    },
  ]) {
    const bad = structuredClone(e);
    mutate(bad.database.failureWindows);
    assert.throws(() => validateTemporal(bad));
  }
});
test('healthy complete sources retain empty temporal windows without changing quality', () => {
  const f = fixture();
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.equal(e.quality, 'complete');
  assert.deepEqual(e.database.failureWindows.windows, []);
  assert.deepEqual(e.database.failureWindows.runtimeWindows, []);
  validateCausalEvidence(e, {
    templates: f.report.inventoryTemplates,
    actors: options.actors,
    phases: options.phases,
  });
});

test('partial unavailable sample offsets retain every independently computable time', () => {
  const f = temporalFixture();
  f.records[2].start = 50;
  const e = joinCausalEvidence(f.report, f.records, options);
  const p = e.database.failureWindows;
  assert.equal(p.available, false);
  assert.equal(p.windows[0].startOffsetMs, null);
  assert.equal(p.windows[0].endOffsetMs, 1229);
  assert.equal(p.windows[0].durationMs, 1279);
  assert.equal(p.windows[0].runtimeWindowOrdinals, null);
  assert.deepEqual(p.runtimeWindows, []);
  validateTemporal(e);
});
test('every error timeout busy record retains stable source ordinals and deduplicated runtime windows', () => {
  const f = temporalFixture();
  f.records.splice(2, 0, {
    kind: 'database',
    start: 450,
    end: 900,
    outcome: 'success',
    groups: [],
  });
  f.records.splice(
    4,
    0,
    {
      kind: 'database',
      start: 1000,
      end: 1329,
      outcome: 'timeout',
      groups: [],
      diagnostic: { category: 'query-canceled', name: 'Error', code: '57014' },
    },
    {
      kind: 'database',
      start: 1329,
      end: 1329,
      outcome: 'busy',
      groups: [],
      diagnostic: { category: 'busy', name: 'NONE', code: 'NONE' },
    },
  );
  f.records.at(-1).records += 3;
  f.records.at(-1).databaseSamples += 3;
  const e = joinCausalEvidence(f.report, f.records, options);
  const p = e.database.failureWindows;
  assert.deepEqual(
    p.windows.map((w) => w.observationOrdinal),
    [2, 3, 4],
  );
  assert.deepEqual(
    p.windows.map((w) => w.outcome),
    ['error', 'timeout', 'busy'],
  );
  assert.deepEqual(
    p.windows.map((w) => w.runtimeWindowOrdinals),
    [[1, 2], [2], [2]],
  );
  assert.deepEqual(
    p.runtimeWindows.map((r) => r.ordinal),
    [1, 2],
  );
  assert.equal(e.reasons.samplerFailure, 3);
  assert.equal(
    p.windows.reduce((sum, w) => sum + w.durationMs, 0),
    1158,
  );
  validateTemporal(e);
  for (const mutate of [
    (p) => {
      p.windows[1].observationOrdinal = 2;
    },
    (p) => {
      p.windows.reverse();
    },
    (p) => {
      p.windows[0].runtimeWindowOrdinals = [2, 1];
    },
    (p) => {
      p.runtimeWindows[0].ordinal = 901;
    },
    (p) => {
      p.windows[0].overlappingClientAttempts = 2;
    },
    (p) => {
      p.runtimeWindows = Array.from({ length: 901 }, () => p.runtimeWindows[0]);
    },
    (p) => {
      p.windows = Array.from({ length: 451 }, () => p.windows[0]);
    },
  ]) {
    const bad = structuredClone(e);
    mutate(bad.database.failureWindows);
    assert.throws(() => validateTemporal(bad));
  }
});
test('empty runtime overlap remains known empty and malformed raw evidence is never salvaged', () => {
  const f = temporalFixture();
  f.records[2].start = 1450;
  f.records[2].end = 1500;
  f.records.splice(2, 1);
  f.records.splice(3, 0, {
    kind: 'database',
    start: 1450,
    end: 1500,
    outcome: 'error',
    groups: [],
  });
  const e = joinCausalEvidence(f.report, f.records, options);
  assert.deepEqual(
    e.database.failureWindows.windows[0].runtimeWindowOrdinals,
    [],
  );
  assert.deepEqual(e.database.failureWindows.runtimeWindows, []);
  validateTemporal(e);
  f.records[3].secret = 'privacy-canary';
  const invalid = joinCausalEvidence(f.report, f.records, options);
  assert.equal(invalid.reasons.invalidSchema, 1);
  assert.deepEqual(invalid.database.failureWindows.windows, []);
  assert.equal(invalid.database.failureWindows.available, false);
  assert.equal(JSON.stringify(invalid).includes('privacy-canary'), false);
});
