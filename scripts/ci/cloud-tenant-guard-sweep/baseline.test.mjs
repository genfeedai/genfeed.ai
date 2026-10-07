import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  captureOverrideLogOffset,
  classifyHits,
  hitSummary,
  loadBaseline,
  logEvidence,
  OVERRIDE_PHASE,
  trustedBaseline,
  validateBaselineRatchet,
} from './baseline.mjs';

const message =
  'Tenant isolation: findFirst on AgentThread is missing organizationId';
const entry = {
  method: 'GET',
  route: '/v1/agent/threads/{threadId}',
  models: ['AgentThread.findFirst'],
};
const baseline = { issue: 'TBD', entries: [entry] };
const response = {
  actor: 'S:A',
  method: 'GET',
  route: entry.route,
  path: '/v1/agent/threads/seeded-id?organizationId=org-A',
  phase: 'get',
  sweepPhase: OVERRIDE_PHASE,
  hasTenantHit: true,
  message,
};

function tempDirectory(context) {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-sweep-baseline-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('baseline loader accepts the empty committed baseline and explicit route/model entries', (context) => {
  assert.ok(Array.isArray(loadBaseline().entries));
  const path = join(tempDirectory(context), 'baseline.json');
  writeFileSync(path, JSON.stringify({ issue: 'TBD', entries: [] }));
  assert.deepEqual(loadBaseline(path), { issue: 'TBD', entries: [] });
  writeFileSync(path, JSON.stringify(baseline));
  assert.deepEqual(loadBaseline(path), baseline);
  writeFileSync(
    path,
    JSON.stringify({ issue: '#6177', entries: [{ ...entry, models: [] }] }),
  );
  assert.deepEqual(loadBaseline(path).entries[0].models, []);
});

test('baseline loader fails closed on missing, malformed and duplicate entries', (context) => {
  const path = join(tempDirectory(context), 'baseline.json');
  assert.throws(() => loadBaseline(path), /ENOENT/);
  writeFileSync(path, '{invalid');
  assert.throws(() => loadBaseline(path), SyntaxError);
  for (const value of [
    null,
    {},
    { issue: '', entries: [] },
    { issue: 'TBD', entries: {} },
    { issue: 'TBD', entries: [null] },
    { issue: 'TBD', entries: [{ ...entry, method: 'POST' }] },
    {
      issue: 'TBD',
      entries: [{ ...entry, route: `${entry.route}?organizationId=org-A` }],
    },
    { issue: 'TBD', entries: [{ ...entry, models: ['AgentThread'] }] },
    { issue: 'TBD', entries: [{ ...entry, models: [42] }] },
    { issue: 'TBD', entries: [entry, entry] },
  ]) {
    writeFileSync(path, JSON.stringify(value));
    assert.throws(
      () => loadBaseline(path),
      /baseline entry|expected issue and entries/,
    );
  }
});

test('offset capture waits for pending strict logs and measures bytes', async (context) => {
  const path = join(tempDirectory(context), 'api.log');
  writeFileSync(path, 'boot ✓\n');
  const waits = [];
  const offset = await captureOverrideLogOffset(path, async (ms) => {
    waits.push(ms);
    appendFileSync(path, `${message}\n`);
  });
  assert.deepEqual(waits, [1000]);
  assert.equal(offset, readFileSync(path).length);
});

test('API-log phase attribution uses byte offsets, including unicode and the boundary line', () => {
  const strict = `boot ✓\n${message}\n`;
  const log = Buffer.from(`${strict}${message}\n`);
  const hits = logEvidence(log, Buffer.byteLength(strict));
  assert.deepEqual(
    hits.map((hit) => hit.phase),
    ['strict', OVERRIDE_PHASE],
  );
  assert.deepEqual(
    hits.map((hit) => hit.byteOffset),
    [Buffer.byteLength('boot ✓\n'), Buffer.byteLength(strict)],
  );
  const classified = classifyHits([], hits, baseline);
  assert.equal(classified.tenantHitGroups.length, 1);
  assert.equal(classified.knownHits.length, 1);
  assert.equal(
    classifyHits([], logEvidence(log), baseline).knownHits.length,
    0,
  );
  for (const offset of [-1, 1.5, log.length + 1])
    assert.throws(() => logEvidence(log, offset), /byte offset/);
});

test('strict response hits always fail even when their route and model are baselined', () => {
  for (const actor of ['M:A', 'M2:B', 'S', 'S:A']) {
    const result = classifyHits(
      [{ ...response, actor, sweepPhase: 'controls' }],
      [],
      baseline,
    );
    assert.equal(result.tenantHitGroups.length, 1);
    assert.equal(result.knownHits.length, 0);
    assert.deepEqual(result.suggestedBaseline.entries, []);
  }
});

test('S:A response allowance matches METHOD and exact templated route, regardless of model', () => {
  const result = classifyHits([response], [], baseline);
  assert.equal(result.tenantHitGroups.length, 0);
  assert.equal(result.knownHits.length, 1);
  assert.deepEqual(result.staleBaselineEntries, []);
  assert.match(hitSummary(result), /::warning::1 known S:A tenant hits/);
  assert.equal(
    classifyHits(
      [{ ...response, message: 'TenantIsolationError' }],
      [],
      baseline,
    ).knownHits.length,
    1,
  );
  assert.equal(
    classifyHits(
      [{ ...response, message: 'Tenant isolation: findMany on Article' }],
      [],
      baseline,
    ).knownHits.length,
    1,
  );
  for (const request of [
    { ...response, route: '/v1/agent/threads/seeded-id' },
    { ...response, route: '/v1/agent/memories/{memoryId}' },
    { ...response, method: 'POST' },
    { ...response, actor: 'M:A' },
    { ...response, sweepPhase: undefined },
  ])
    assert.equal(
      classifyHits([request], [], baseline).tenantHitGroups.length,
      1,
    );
});

test('S:A API-log allowance requires an exact baselined Model.operation', () => {
  const known = classifyHits([], logEvidence(`${message}\n`, 0), baseline);
  assert.equal(known.tenantHitGroups.length, 0);
  assert.equal(known.knownHits.length, 1);
  assert.deepEqual(known.staleBaselineEntries, []);
  for (const unknown of [
    'Tenant isolation: findMany on AgentThread',
    'Tenant isolation: findFirst on AgentMemory',
    'TenantIsolationError',
  ]) {
    const result = classifyHits([], logEvidence(`${unknown}\n`, 0), baseline);
    assert.equal(result.tenantHitGroups.length, 1);
    assert.equal(result.knownHits.length, 0);
  }
});

test('stale entries warn without failing and never dilute strict failures', () => {
  const stale = classifyHits([], [], baseline);
  assert.equal(stale.tenantHitGroups.length, 0);
  assert.deepEqual(stale.staleBaselineEntries, [entry]);
  assert.match(
    hitSummary(stale),
    /::warning::Stale S:A baseline entry: GET .* produced no hit/,
  );
  const strict = classifyHits([], logEvidence(`${message}\n`), baseline);
  assert.equal(strict.tenantHitGroups.length, 1);
  assert.deepEqual(strict.staleBaselineEntries, [entry]);
});

test('suggestedBaseline includes all S:A hits, deduplicates and sorts models, and excludes strict evidence', () => {
  const memory = {
    ...response,
    route: '/v1/agent/memories/{memoryId}',
    path: '/v1/agent/memories/memory-id',
    message: 'Tenant isolation: findMany on AgentMemory',
  };
  const log = `GET /v1/agent/threads/seeded-id 500 — Tenant isolation: findMany on AgentThread\n${message}\n`;
  const hits = logEvidence(log, 0);
  const requests = [response, response, memory];
  const result = classifyHits(
    [
      ...requests,
      {
        ...response,
        actor: 'M:A',
        sweepPhase: 'memberAGets',
        route: '/v1/private',
        message: 'Tenant isolation: findMany on Private',
      },
    ],
    hits,
    { issue: '#6177', entries: [] },
  );
  assert.deepEqual(result.suggestedBaseline, {
    issue: '#6177',
    entries: [
      { method: 'GET', route: memory.route, models: ['AgentMemory.findMany'] },
      {
        method: 'GET',
        route: entry.route,
        models: ['AgentThread.findFirst', 'AgentThread.findMany'],
      },
    ],
  });
  assert.equal(
    classifyHits(requests, hits, result.suggestedBaseline).tenantHitGroups
      .length,
    0,
  );
  const output = hitSummary(result);
  const json = output
    .split('--- suggestedBaseline ---\n')[1]
    .split('\n--- end ---')[0];
  assert.deepEqual(JSON.parse(json), result.suggestedBaseline);
});

test('log-only S:A suggestions use a recorded OpenAPI route even without a log URL', () => {
  const requests = [{ ...response, hasTenantHit: false, message: null }];
  const hits = logEvidence(`${message}\n`, 0);
  const result = classifyHits(requests, hits, { issue: 'TBD', entries: [] });
  assert.deepEqual(result.suggestedBaseline, baseline);
  assert.equal(
    classifyHits(requests, hits, result.suggestedBaseline).tenantHitGroups
      .length,
    0,
  );
});

test('runner completes strict GETs, controls and tools before capturing the S:A log boundary', () => {
  const source = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  const strict = source.indexOf('await concurrentMap(');
  const controls = source.indexOf("await measure('controls'");
  const tools = source.indexOf('await sweepTools(');
  const offset = source.indexOf('await captureOverrideLogOffset(');
  const override = source.indexOf(
    'await getPhase(contexts[3], OVERRIDE_PHASE)',
  );
  assert.ok(
    strict > 0 &&
      strict < controls &&
      controls < tools &&
      tools < offset &&
      offset < override,
  );
  assert.match(source, /contexts\.slice\(0, 3\)/);
  assert.match(source, /Math\.min\(480_000, deadline\.remaining\(\)\)/);
  assert.match(source, /GITHUB_STEP_SUMMARY/);
});

test('baseline ratchet permits only shrinkage from a trusted base', () => {
  assert.deepEqual(validateBaselineRatchet({ entries: [] }, baseline), {
    entries: [],
  });
  assert.throws(() => validateBaselineRatchet(baseline), /expansion rejected/);
  assert.throws(
    () =>
      validateBaselineRatchet(
        {
          entries: [{ ...entry, models: [...entry.models, 'Brand.findFirst'] }],
        },
        baseline,
      ),
    /expansion rejected/,
  );
  assert.throws(
    () =>
      validateBaselineRatchet(
        { entries: [{ ...entry, route: '/v1/new' }] },
        baseline,
      ),
    /expansion rejected/,
  );
  assert.equal(validateBaselineRatchet(baseline, baseline), baseline);
});

test('a trusted base without the baseline file grants no allowances', () => {
  let calls = 0;
  const trusted = trustedBaseline('trusted-base', (_command, args) => {
    calls++;
    assert.equal(args[0], 'ls-tree');
    return '';
  });
  assert.deepEqual(trusted, { entries: [] });
  assert.equal(calls, 1);
  assert.throws(
    () => validateBaselineRatchet(baseline, trusted),
    /expansion rejected/,
  );
  assert.throws(
    () =>
      trustedBaseline('missing-ref', () => {
        throw new Error('Missing trusted commit');
      }),
    /Missing trusted commit/,
  );
});

test('trusted base reads use checkout root independently of caller cwd', () => {
  const paths = [];
  trustedBaseline('trusted-ref', (_command, args, options) => {
    paths.push(options.cwd);
    return args[0] === 'ls-tree'
      ? 'baseline.json'
      : JSON.stringify({ entries: [] });
  });
  assert.equal(paths.length, 2);
  assert.ok(
    paths.every(
      (path) => path === new URL('../../../', import.meta.url).pathname,
    ),
  );
});
