import assert from 'node:assert/strict';
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
    pool: { end: () => Promise.resolve() },
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
