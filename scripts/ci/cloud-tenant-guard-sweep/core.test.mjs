import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  concurrentMap,
  coverageErrors,
  createConcurrencyLimiter,
  createDeadline,
  distinctTools,
  durationSummary,
  expandRoute,
  GET_SKIPS,
  getContexts,
  getRoutes,
  groupHits,
  logHits,
  measurePhase,
  normalizePath,
  parameterValue,
  parseEnv,
  phaseRequestStats,
  requiredEnvKeys,
  schemaValue,
  sweepGets,
  sweepTools,
  tenantHit,
  timeoutStats,
  toolSkipReason,
} from './core.mjs';

const fixture = {
  organizationId: 'corganization123',
  brandId: 'cbrand12345',
  personaId: 'cpersona123',
  grantId: 'cgrant12345',
  userId: 'opaque-user',
};

test('fake env covers every CLOUD-required schema key, including API overrides', () => {
  const directory = new URL(
    '../../../packages/config/src/schemas/',
    import.meta.url,
  );
  const sources = readdirSync(directory)
    .filter((name) => name.endsWith('.schema.ts'))
    .map((name) => readFileSync(new URL(name, directory), 'utf8'));
  sources.push(
    readFileSync(
      new URL(
        '../../../packages/libs/config/config.service.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const env = parseEnv(
    readFileSync(
      new URL('./cloud-sweep.placeholders', import.meta.url),
      'utf8',
    ),
  );
  const keys = requiredEnvKeys(sources);
  // Outside conditionalRequired(): services/microservices/microservices.service.ts,
  // auth/better-auth/{better-auth.config,better-auth.module}.ts in the API,
  // packages/libs/prisma/prisma.service.ts, services/batch-generation/batch-review-lock.ts,
  // and packages/config/src/schemas/base.schema.ts.
  keys.push(
    'GENFEEDAI_MICROSERVICES_FILES_URL',
    'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
    'GENFEEDAI_MICROSERVICES_MCP_URL',
    'GENFEEDAI_API_KEY',
    'BETTER_AUTH_SECRET',
    'DATABASE_URL',
    'PORT',
    'TOKEN_ENCRYPTION_KEY',
  );
  assert.ok(keys.length >= 40);
  assert.ok(keys.includes('ELEVENLABS_API_KEY'));
  const microservicesSource = readFileSync(
    new URL(
      '../../../apps/server/api/src/services/microservices/microservices.service.ts',
      import.meta.url,
    ),
    'utf8',
  );
  for (const [, key] of microservicesSource.matchAll(
    /this\.getRequiredServiceUrl\(\s*'([^']+)'/g,
  ))
    assert.ok(keys.includes(key), `${key} needs a boot-requirement assertion`);
  for (const key of keys)
    assert.ok(env[key], `${key} is required in CLOUD mode`);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.GENFEED_CLOUD, 'true');
  assert.equal(env.BETTER_AUTH_ENABLED, 'true');
  assert.equal(env.TRUST_PROXY, 'false');
  assert.equal(env.ADMIN_ALLOWED_IPS, '127.0.0.1,::1');
  assert.ok(env.TOKEN_ENCRYPTION_KEY.length >= 32);
  assert.ok(env.BETTER_AUTH_SECRET.length >= 32);
  for (const key of [
    'GENFEEDAI_MICROSERVICES_FILES_URL',
    'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
    'GENFEEDAI_MICROSERVICES_MCP_URL',
  ]) {
    const url = new URL(env[key]);
    assert.ok(!['3010', '5432', '6379'].includes(url.port));
  }
  // Optional fail-fast paths stay unset: HarnessService loads built-ins;
  // ConfigService/PrismaService require valid signing material only as a pair.
  for (const key of [
    'ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER',
    'CONTENT_HARNESS_PACKAGES',
    'GENFEEDAI_CDN_SIGNING_KEY_PAIR_ID',
    'GENFEEDAI_CDN_SIGNING_PRIVATE_KEY',
    'GENFEEDAI_MEDIA_ISSUER_ENABLED',
  ])
    assert.equal(env[key], undefined);
  for (const [key, value] of Object.entries(env)) {
    if (/(?:KEY|SECRET|TOKEN|CLIENT_ID|APP_ID)$/.test(key))
      assert.ok(
        value.startsWith('ci-placeholder-'),
        `${key} must be an obvious non-secret`,
      );
    if (/(?:URL|URI|DSN)$/.test(key))
      assert.equal(
        new URL(value).hostname,
        'localhost',
        `${key} must be job-local`,
      );
  }
});

test('env derivation handles multiline declarations and fails closed on an unfamiliar form', () => {
  assert.deepEqual(
    requiredEnvKeys([
      'KEY_ONE: conditionalRequired(),\nKEY_TWO: conditionalRequired(\n Joi.string())',
    ]),
    ['KEY_ONE', 'KEY_TWO'],
  );
  assert.deepEqual(
    requiredEnvKeys([
      '// FAKE: conditionalRequired()\n/* IGNORED: conditionalRequired() */',
    ]),
    [],
  );
  assert.throws(
    () => requiredEnvKeys(['newKey = conditionalRequired()']),
    /Unrecognized/,
  );
});

test('detects all response surfaces, including successful HTTP tool failures', () => {
  for (const body of [
    {
      errors: [
        {
          title: 'TenantIsolationError',
          detail:
            'Tenant isolation: findMany on Brand is missing organizationId in CLOUD mode.',
        },
      ],
    },
    {
      statusCode: 500,
      detail:
        'Tenant isolation: findUnique on Persona is missing organizationId in CLOUD mode.',
    },
    {
      success: false,
      error: 'Tenant isolation: update on Workflow used another tenant',
    },
    { errors: [{ title: 'TenantIsolationError' }] },
  ])
    assert.ok(tenantHit(body));
  assert.equal(tenantHit('Internal server error'), null);
  const lines = logHits(
    'GET /v1/voices 500 — Tenant isolation: findMany on Voice is missing organizationId\nnormal boot\n',
  );
  assert.equal(lines.length, 1);
  const grouped = groupHits(
    [
      {
        actor: 'M:A',
        method: 'GET',
        route: '/v1/brands',
        hasTenantHit: true,
        message:
          'Tenant isolation: findMany on Brand is missing organizationId',
      },
    ],
    lines,
  );
  assert.deepEqual(
    grouped.map(({ model, operation }) => [model, operation]),
    [
      ['Brand', 'findMany'],
      ['Voice', 'findMany'],
    ],
  );
});

test('normalizes prefixes, fills seeded IDs and required queries without skipping parameter routes', () => {
  const document = {
    paths: {
      '/personas/{id}/grants': {
        get: {
          parameters: [
            {
              in: 'query',
              required: true,
              name: 'brandId',
              schema: { type: 'string' },
            },
            {
              in: 'query',
              required: true,
              name: 'page',
              schema: { type: 'integer' },
            },
          ],
        },
      },
      '/v1/brands/{brandId}': { get: {} },
      '/costs/export': { get: {} },
      '/agent/threads/{threadId}/events': { get: {} },
      '/workflows/{workflowId}/export-comfyui': { get: {} },
      '/posts': { post: {} },
    },
  };
  const routes = getRoutes(document);
  assert.equal(routes.length, 5);
  assert.equal(routes.filter((route) => route.skipReason).length, 1);
  assert.equal(
    expandRoute(routes[0], fixture, document, fixture.organizationId),
    '/v1/personas/cpersona123/grants?brandId=cbrand12345&page=1&organizationId=corganization123',
  );
  assert.equal(
    expandRoute(routes[1], fixture, document),
    '/v1/brands/cbrand12345',
  );
  assert.match(parameterValue('workflowId', '', fixture), /^[0-9a-f-]{36}$/);
  assert.equal(
    parameterValue('id', '/v1/brands/{id}/brand-os', fixture),
    fixture.brandId,
  );
  assert.equal(
    parameterValue('organizationId', '', fixture),
    fixture.organizationId,
  );
  assert.equal(normalizePath('/v1/health'), '/v1/health');
  for (const [path, reason] of GET_SKIPS) {
    assert.ok(path.startsWith('/v1/'));
    assert.ok(reason);
  }
});

test('builds nested, referenced, enum, array, and union tool parameters', () => {
  const schema = {
    type: 'object',
    $defs: {
      input: {
        type: 'object',
        required: ['brandId'],
        properties: { brandId: { type: 'string' } },
      },
    },
    required: [
      'characterId',
      'organizationId',
      'ids',
      'input',
      'mode',
      'count',
      'enabled',
      'date',
      'choice',
    ],
    properties: {
      characterId: { type: 'string' },
      organizationId: { type: 'string' },
      ids: { type: 'array', minItems: 2, items: { type: 'string' } },
      input: { $ref: '#/$defs/input' },
      mode: { enum: ['ALL_BRANDS'] },
      count: { type: 'integer', minimum: 3 },
      enabled: { type: 'boolean' },
      date: { type: 'string', format: 'date-time' },
      choice: { anyOf: [{ type: 'null' }, { type: 'integer' }] },
      optional: { type: 'string' },
    },
  };
  const result = schemaValue(schema, '', fixture);
  assert.equal(result.characterId, fixture.personaId);
  assert.equal(result.organizationId, fixture.organizationId);
  assert.equal(result.ids.length, 2);
  assert.deepEqual(result.input, { brandId: fixture.brandId });
  assert.equal(result.mode, 'ALL_BRANDS');
  assert.equal(result.count, 3);
  assert.equal(result.enabled, false);
  assert.equal(result.choice, 1);
  assert.equal(result.optional, undefined);
  assert.throws(
    () => schemaValue({ $ref: '#/$defs/missing' }),
    /Missing schema/,
  );
  assert.deepEqual(
    schemaValue({
      type: 'object',
      minProperties: 1,
      properties: { concept: { type: 'object', properties: {} } },
    }),
    { concept: {} },
  );
  assert.deepEqual(
    schemaValue({ type: 'array', maxItems: 0, items: { type: 'string' } }),
    [],
  );
  assert.equal(
    schemaValue(
      { type: 'string', pattern: '^[1-9]\\d{0,3}:[1-9]\\d{0,3}$' },
      'aspectRatio',
    ),
    '1:1',
  );
});

test('deduplicates both tool surfaces and runs destructive tools last', () => {
  const read = { name: 'read', annotations: { destructiveHint: false } };
  const remove = { name: 'remove', annotations: { destructiveHint: true } };
  assert.deepEqual(
    distinctTools([remove, read], [read, { name: 'mcp_only' }]).map(
      (tool) => tool.name,
    ),
    ['mcp_only', 'read', 'remove'],
  );
  assert.ok(toolSkipReason(400, 'Tool x has no agent executor wired up'));
  assert.ok(toolSkipReason(403, 'Tool x requires superadmin'));
  assert.ok(toolSkipReason(200, '{"errorCode":"UNSUPPORTED_APPROVAL"}'));
  assert.equal(
    toolSkipReason(
      500,
      'Tenant isolation: findMany on Brand UNSUPPORTED_APPROVAL',
    ),
    null,
  );
  assert.equal(toolSkipReason(404, 'Feature disabled'), null);
});

test('bounded concurrency finishes independent requests despite tenant-hit results', async () => {
  let active = 0;
  let peak = 0;
  const results = await concurrentMap(
    Array.from({ length: 15 }, (_, index) => index),
    3,
    async (index) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { index, hasTenantHit: index === 2 };
    },
  );
  assert.equal(peak, 3);
  assert.equal(results.length, 15);
  assert.equal(results[2].hasTenantHit, true);
  assert.equal(results[14].index, 14);
});

test('coverage fails closed on empty discovery, dead auth, throttling and missing tool surface', () => {
  assert.ok(
    coverageErrors([], 0, 0).some((error) => error.includes('minimum 100')),
  );
  assert.ok(
    coverageErrors([], 0, 0).some((error) => error.includes('minimum 20')),
  );
  const requests = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    Array.from({ length: 100 }, () => ({ actor, phase: 'get', status: 200 })),
  );
  requests.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, () => ({ actor, phase: 'tool', status: 200 })),
    ),
  );
  assert.deepEqual(coverageErrors(requests, 100, 20), []);
  for (const status of [0, 401, 429]) {
    const failed = requests.map((request, index) =>
      index === 0 ? { ...request, status } : request,
    );
    assert.ok(
      coverageErrors(failed, 100, 20).some((error) => error.startsWith('M:A:')),
    );
  }
  assert.ok(
    coverageErrors(
      requests.map((request) =>
        request.phase === 'tool' ? { ...request, status: 404 } : request,
      ),
      100,
      20,
    ).some((error) => error.includes('tools accepted')),
  );
});

test('GET contexts share 10 workers and retain independent member users', async () => {
  const contexts = getContexts({
    member: { label: 'M', userId: 'user-M' },
    member2: { label: 'M2', userId: 'user-M2' },
    superadmin: { label: 'S', userId: 'user-S' },
    orgA: { organizationId: 'org-A' },
    orgB: { organizationId: 'org-B' },
    orgS: { organizationId: 'org-S' },
  });
  assert.notEqual(contexts[0].actor.userId, contexts[1].actor.userId);
  assert.equal(contexts[1].organization.organizationId, 'org-B');
  assert.equal(contexts[2].override, undefined);
  assert.equal(contexts[3].override, 'org-A');
  const active = new Map();
  const peaks = new Map();
  let total = 0;
  let peak = 0;
  let calls = 0;
  await sweepGets(contexts, Array.from({ length: 35 }), async ({ actor }) => {
    calls++;
    const count = (active.get(actor.label) ?? 0) + 1;
    active.set(actor.label, count);
    peaks.set(actor.label, Math.max(peaks.get(actor.label) ?? 0, count));
    peak = Math.max(peak, ++total);
    await Promise.resolve();
    active.set(actor.label, active.get(actor.label) - 1);
    total--;
  });
  assert.equal(calls, 140);
  assert.equal(peak, 10);
  assert.equal(peaks.size, 4);
  assert.ok([...peaks.values()].every((peak) => peak <= 3));
});

test('tool phases share 10/5/2 workers, run writes only as M:A and drain before mutations', async () => {
  const tools = ['read', 'hint', 'write', 'delete'].flatMap((kind) =>
    Array.from({ length: 33 }, (_, index) => ({
      name: `${kind}_${index}`,
      annotations: {
        readOnlyHint: kind === 'hint' || kind === 'delete',
        destructiveHint: kind === 'delete',
      },
    })),
  );
  const contexts = [{ actor: { label: 'M:A' } }, { actor: { label: 'S' } }];
  const peaks = new Map();
  const calls = [];
  const phases = [];
  const finished = { readOnlyTools: 0, writeTools: 0, destructiveTools: 0 };
  let active = 0;
  await sweepTools(
    tools,
    contexts,
    (name) => name.startsWith('read_'),
    async ({ actor }, tool, phase) => {
      if (phase === 'writeTools') assert.equal(finished.readOnlyTools, 132);
      if (phase === 'destructiveTools') assert.equal(finished.writeTools, 33);
      if (phase !== 'readOnlyTools') assert.equal(actor.label, 'M:A');
      calls.push(`${actor.label}/${tool.name}`);
      peaks.set(phase, Math.max(peaks.get(phase) ?? 0, ++active));
      await Promise.resolve();
      active--;
      finished[phase]++;
    },
    async (name, run) => {
      phases.push(name);
      await run();
      assert.equal(active, 0);
    },
  );
  assert.deepEqual(phases, ['readOnlyTools', 'writeTools', 'destructiveTools']);
  assert.deepEqual([...peaks.values()], [10, 5, 2]);
  assert.deepEqual(finished, {
    readOnlyTools: 132,
    writeTools: 33,
    destructiveTools: 33,
  });
  assert.equal(new Set(calls).size, calls.length);
  assert.equal(
    calls.filter((call) => call.startsWith('M:A/')).length,
    tools.length,
  );
  assert.equal(calls.filter((call) => call.startsWith('S/')).length, 66);
});

test('any unresolved timeout fails and retries do not dilute evidence', () => {
  assert.equal(timeoutStats([]).hasExceededLimit, false);
  const requests = Array.from({ length: 100 }, (_, index) => ({
    isTimeout: index < 5,
  }));
  assert.deepEqual(timeoutStats(requests), {
    count: 5,
    requests: 100,
    ratio: 0.05,
    hasExceededLimit: true,
  });
  requests[5].isTimeout = true;
  requests.push(
    ...Array.from({ length: 100 }, () => ({ status: 429, isRetry: true })),
  );
  assert.equal(timeoutStats(requests).ratio, 0.06);
  assert.equal(timeoutStats(requests).hasExceededLimit, true);
  const minimumCoverage = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    Array.from({ length: 100 }, (_, index) => ({
      actor,
      phase: 'get',
      status: index ? 200 : 0,
      isTimeout: index === 0,
    })),
  );
  minimumCoverage.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, () => ({ actor, phase: 'tool', status: 200 })),
    ),
  );
  assert.ok(
    coverageErrors(minimumCoverage, 100, 20).some((error) =>
      error.includes('maximum 0 unresolved requests'),
    ),
  );
  const covered = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    Array.from({ length: 120 }, () => ({ actor, phase: 'get', status: 200 })),
  );
  covered.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, (_, index) => ({
        actor,
        phase: 'tool',
        status: index ? 200 : 0,
        isTimeout: index === 0,
      })),
    ),
  );
  assert.ok(
    coverageErrors(covered, 120, 20).some((error) =>
      error.includes('maximum 0 unresolved requests'),
    ),
  );
  for (let index = 0; index < 25; index++) {
    covered[index].isTimeout = true;
    covered[index].status = 0;
  }
  assert.ok(
    coverageErrors(covered, 120, 20).some((error) =>
      error.includes('maximum 0 unresolved requests'),
    ),
  );
});

test('deadline stops queueing requests and drains workers before reporting', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    concurrentMap(
      Array.from({ length: 100 }),
      16,
      async () => {
        if (++calls === 16)
          controller.abort(new Error('Sweep budget exceeded'));
        await Promise.resolve();
      },
      controller.signal,
    ),
    /Sweep budget exceeded/,
  );
  assert.equal(calls, 16);
});

test('phase durations include failed phases and render total seconds', async () => {
  const durations = {};
  let now = 100;
  await assert.rejects(
    measurePhase(
      durations,
      'gets',
      async () => {
        now = 1350;
        throw new Error('Failed phase');
      },
      () => now,
    ),
    /Failed phase/,
  );
  durations.total = 2000;
  assert.equal(durations.gets, 1250);
  assert.match(durationSummary(durations), /gets: 1.25s/);
  assert.match(durationSummary(durations), /total: 2.00s/);
});

test('fixture and warm-up timeouts cannot inflate or dilute the sweep ratio gate', () => {
  const setup = Array.from({ length: 200 }, (_, index) => ({
    phase: index % 2 ? 'fixture' : 'warmup',
    isTimeout: index < 100,
    status: index < 100 ? 0 : 200,
  }));
  assert.deepEqual(timeoutStats(setup), {
    count: 0,
    requests: 0,
    ratio: 0,
    hasExceededLimit: false,
  });
  const sweep = Array.from({ length: 100 }, (_, index) => ({
    phase: 'get',
    isTimeout: index < 5,
  }));
  assert.deepEqual(timeoutStats([...setup, ...sweep]), {
    count: 5,
    requests: 100,
    ratio: 0.05,
    hasExceededLimit: true,
  });
  sweep[5].isTimeout = true;
  assert.equal(timeoutStats([...setup, ...sweep]).ratio, 0.06);
  assert.equal(timeoutStats([...setup, ...sweep]).hasExceededLimit, true);
  const controls = [{ phase: 'controls', isTimeout: true }, { phase: 'tool' }];
  assert.equal(timeoutStats([...setup, ...controls]).ratio, 0.5);
});

test('coverage gate ignores successful setup retries but fails any sweep unknown', () => {
  const requests = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    Array.from({ length: 100 }, () => ({ actor, phase: 'get', status: 200 })),
  );
  requests.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, () => ({ actor, phase: 'tool', status: 200 })),
    ),
  );
  const setup = Array.from({ length: 1000 }, (_, index) => ({
    phase: index % 2 ? 'fixture' : 'warmup',
    status: 0,
    isTimeout: true,
  }));
  assert.deepEqual(coverageErrors([...setup, ...requests], 100, 20), []);
  for (let index = 0; index < 23; index++) {
    requests[index].isTimeout = true;
    requests[index].status = 0;
  }
  assert.ok(
    coverageErrors([...setup, ...requests], 100, 20).some((message) =>
      message.includes('maximum 0 unresolved requests'),
    ),
  );
});

test('one limiter caps concurrent callers and releases slots after rejection', async () => {
  const limit = createConcurrencyLimiter(10);
  let active = 0;
  let peak = 0;
  const results = await Promise.allSettled(
    ['getA', 'getB', 'getS', 'controls', 'tools'].flatMap((phase) =>
      Array.from({ length: 25 }, (_, index) =>
        limit(async () => {
          peak = Math.max(peak, ++active);
          await Promise.resolve();
          active--;
          if (index === 0) throw new Error(phase);
          return phase;
        }),
      ),
    ),
  );
  assert.equal(peak, 10);
  assert.equal(active, 0);
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    5,
  );
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    120,
  );
  assert.equal(await limit(() => 'slot released'), 'slot released');
  assert.throws(() => createConcurrencyLimiter(0), /positive integer/);
});

test('tool coverage expects all tools as M:A and only reads as S', () => {
  const requests = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    Array.from({ length: 100 }, () => ({ actor, phase: 'get', status: 200 })),
  );
  requests.push(
    ...Array.from({ length: 30 }, () => ({
      actor: 'M:A',
      phase: 'tool',
      status: 200,
    })),
    ...Array.from({ length: 12 }, () => ({
      actor: 'S',
      phase: 'tool',
      status: 200,
    })),
  );
  assert.deepEqual(coverageErrors(requests, 100, 30, 12), []);
  requests.pop();
  assert.ok(
    coverageErrors(requests, 100, 30, 12).some((error) =>
      /S: 11\/12 tool/.test(error),
    ),
  );
});

test('per-phase counts report retries separately and preserve zero-request phases', () => {
  const records = [
    { phase: 'warmup', isRetry: true, isTimeout: true },
    { phase: 'warmup' },
    { phase: 'get', sweepPhase: 'memberAGets', isTimeout: true },
    { phase: 'get', sweepPhase: 'superadminOverrideGets' },
    { phase: 'tool', sweepPhase: 'writeTools' },
  ];
  assert.deepEqual(
    phaseRequestStats(records, {
      warmup: 100,
      memberAGets: 200,
      superadminOverrideGets: 200,
      writeTools: 50,
      controls: 0,
      total: 550,
    }),
    {
      warmup: { requests: 1, attempts: 2, timeouts: 0 },
      memberAGets: { requests: 1, attempts: 1, timeouts: 1 },
      superadminOverrideGets: { requests: 1, attempts: 1, timeouts: 0 },
      writeTools: { requests: 1, attempts: 1, timeouts: 0 },
      controls: { requests: 0, attempts: 0, timeouts: 0 },
    },
  );
});

test('overall deadline cannot be reset by a later phase and propagates parent abort', () => {
  let clock = 0;
  const parent = new AbortController();
  const deadline = createDeadline(570_000, {
    now: () => clock,
    parentSignal: parent.signal,
  });
  clock = 240_000;
  assert.equal(deadline.remaining(), 330_000);
  parent.abort(new Error('Overall deadline'));
  assert.throws(() => deadline.remaining(), /Overall deadline/);
  const expired = createDeadline(10, { now: () => clock });
  clock += 10;
  assert.throws(() => expired.remaining(), /deadline exceeded/);
});

test('one unresolved timeout or transport failure fails clean acceptance', () => {
  for (const unknown of [
    { status: 0, isTimeout: true },
    { status: 0, isTimeout: false },
  ]) {
    const records = Array.from({ length: 1000 }, () => ({ status: 200 }));
    records.push(unknown);
    assert.equal(timeoutStats(records).hasExceededLimit, true);
    assert.equal(timeoutStats(records).count, 1);
  }
});

test('abort observation keeps first labeled origin and removes all listeners', async () => {
  const { ABORT_SOURCES, observeAbortSources, classifyTransport } =
    await import('./core.mjs');
  for (const source of ABORT_SOURCES) {
    const first = new AbortController(),
      second = new AbortController();
    let removals = 0;
    const remove = first.signal.removeEventListener.bind(first.signal);
    first.signal.removeEventListener = (...values) => {
      removals++;
      remove(...values);
    };
    const observer = observeAbortSources([
      { signal: first.signal, source },
      { signal: second.signal, source: 'overall' },
    ]);
    first.abort();
    second.abort();
    assert.equal(observer.source(), source);
    observer.dispose();
    assert.equal(removals, 1);
  }
  assert.deepEqual(
    classifyTransport({ name: 'private', cause: { code: 'private' } }),
    { errorCode: 'OTHER', errorName: 'OTHER' },
  );
});
test('safe summary keeps unstarted inventory and excludes private request details', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const report = {
    sourceSha: 'a'.repeat(40),
    inventoryTemplates: ['/v1/example/{id}'],
    inventory: {
      memberAGets: {
        'M:A': { discovered: 2, enqueued: 1, started: 1, completed: 0 },
      },
      readOnlyTools: {
        S: { discovered: 4, enqueued: 0, started: 0, completed: 0 },
      },
    },
    requests: [
      {
        status: 0,
        route: '/v1/example/{id}',
        path: '/v1/example/private-token',
        error: 'private-error',
        abortSource: 'overall',
        errorCode: 'OTHER',
        errorName: 'TypeError',
        queueWaitMs: 1,
        headerMs: 2,
        bodyMs: 0,
        totalMs: 3,
      },
    ],
    apiLogHits: ['private-log'],
  };
  const summary = buildDiagnosticSummary(report, { acceptedMail: true });
  assert.equal(summary.phases.memberAGets.coverage['M:A'].unstarted, 1);
  assert.equal(summary.phases.readOnlyTools.coverage.S.unstarted, 4);
  assert.equal(summary.tenantHits.finalLog, 1);
  assert.equal(summary.fixtureProofAvailable, false);
  assert.equal(summary.fixtureProof.acceptedMail, false);
  assert.doesNotMatch(JSON.stringify(summary), /private/);
  assert.throws(() =>
    buildDiagnosticSummary({ ...report, inventory: { unexpected: {} } }),
  );
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      requests: [{ ...report.requests[0], errorName: 'private' }],
    }),
  );
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      inventoryTemplates: ['/v1/path?token=secret'],
    }),
  );
});

test('controls query syntax counts retained attempts independently of coverage and actor', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const { classifyHits } = await import('./baseline.mjs');
  const requests = [
    {
      phase: 'controls',
      actor: 'S',
      organizationQueryPresent: true,
      isRetry: true,
    },
    {
      phase: 'controls',
      actor: 'S',
      organizationQueryPresent: true,
      hasTenantHit: true,
      method: 'GET',
      route: '/v1/personas/{id}/grants',
      status: 500,
      message:
        'Tenant isolation: findFirst on Persona is missing organizationId',
      path: '/v1/personas/private-id/grants?organizationId=private-org',
    },
    { phase: 'controls', actor: 'M', organizationQueryPresent: false },
    { phase: 'controls', actor: 'S' },
    { phase: 'get', actor: 'S:A', organizationQueryPresent: true },
  ];
  const report = {
    sourceSha: 'a'.repeat(40),
    requests,
    inventoryTemplates: ['/v1/personas/{id}/grants'],
    inventory: {
      superadminOverrideGets: {
        'S:A': { discovered: 613, enqueued: 0, started: 0, completed: 0 },
      },
    },
  };
  const summary = buildDiagnosticSummary(report);
  assert.deepEqual(summary.controlOrganizationQueryAttempts, {
    present: 2,
    absent: 1,
    unknown: 1,
  });
  assert.equal(summary.schemaVersion, 1);
  assert.equal(
    summary.phases.superadminOverrideGets.coverage['S:A'].completed,
    0,
  );
  assert.equal(
    summary.phases.superadminOverrideGets.coverage['S:A'].unstarted,
    613,
  );
  assert.equal(summary.tenantHits.strict, 1);
  assert.equal(summary.tenantHits.override, 0);
  assert.equal(summary.slowRoutes[0].route, '/v1/personas/{id}/grants');
  assert.doesNotMatch(
    JSON.stringify(summary),
    /private-id|private-org|organizationId=/,
  );
  const hits = classifyHits(requests, [], { entries: [] });
  assert.equal(hits.tenantHitGroups.length, 1);
  assert.equal(hits.knownHits.length, 0);
  assert.equal(hits.suggestedBaseline.entries.length, 0);
});

for (const value of [null, undefined, 0, 1, 'true', [], {}]) {
  test(`rejects nonboolean query-presence evidence ${JSON.stringify(value)}`, async () => {
    const { buildDiagnosticSummary } = await import('./core.mjs');
    assert.throws(
      () =>
        buildDiagnosticSummary({
          sourceSha: 'a'.repeat(40),
          requests: [{ phase: 'controls', organizationQueryPresent: value }],
        }),
      /organization query presence/,
    );
  });
}

test('complete failure attribution conserves attempts, fixed groups and unknown historical timings', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const templates = Array.from({ length: 12 }, (_, i) => `/v1/failure-${i}`);
  const record = {
    status: 0,
    actor: 'M:A',
    sweepPhase: 'memberAGets',
    phase: 'gets',
    method: 'GET',
    abortSource: 'request timeout',
    errorName: 'TimeoutError',
    errorCode: 'OTHER',
    queueWaitMs: 1,
    headerMs: 2,
    bodyMs: 3,
    totalMs: 6,
  };
  const requests = templates.map((route) => ({ ...record, route }));
  requests.push({ ...record, route: templates[0] });
  requests.push({
    ...record,
    route: templates[0],
    actor: 'S',
    sweepPhase: 'superadminGets',
  });
  requests.push({
    ...record,
    route: templates[0],
    actor: 'private-actor',
    sweepPhase: 'private-phase',
    method: 'private-method',
  });
  const historical = { ...record, route: templates[1] };
  for (const key of ['queueWaitMs', 'headerMs', 'bodyMs', 'totalMs'])
    delete historical[key];
  requests.push(historical);
  requests.push({
    ...record,
    route: '/private-id?private-query',
    body: 'private-body',
    error: 'private-error',
    token: 'private-token',
  });
  const report = {
    sourceSha: 'a'.repeat(40),
    inventoryTemplates: templates,
    requests,
  };
  const summary = buildDiagnosticSummary(report);
  assert.equal(summary.failedRequestGroups.length, 14);
  assert.equal(summary.unattributedFailureAttempts, 1);
  assert.equal(
    summary.failedRequestGroups.reduce(
      (sum, g) => sum + g.attempts,
      summary.unattributedFailureAttempts,
    ),
    requests.length,
  );
  const first = summary.failedRequestGroups.find(
    (g) => g.route === templates[0] && g.actor === 'M:A',
  );
  assert.equal(first.attempts, 2);
  assert.equal(first.timedAttempts, 2);
  assert.equal(first.totalMs, 12);
  assert.equal(first.maximumMs, 6);
  const second = summary.failedRequestGroups.find(
    (g) => g.route === templates[1],
  );
  assert.equal(second.attempts, 2);
  assert.equal(second.timedAttempts, 1);
  assert.equal(second.totalMs, 6);
  assert.ok(
    summary.failedRequestGroups.some(
      (g) =>
        g.actor === 'unknown' && g.phase === 'unknown' && g.method === 'other',
    ),
  );
  assert.deepEqual(
    buildDiagnosticSummary({ ...report, requests: [...requests].reverse() })
      .failedRequestGroups,
    summary.failedRequestGroups,
  );
  assert.equal(summary.mailAttributionAvailable, false);
  for (const value of [
    'private-id',
    'private-query',
    'private-body',
    'private-error',
    'private-token',
    'private-actor',
    'private-phase',
    'private-method',
  ])
    assert.equal(JSON.stringify(summary).includes(value), false);
  const unknownTiming = buildDiagnosticSummary({
    ...report,
    requests: [historical],
  }).failedRequestGroups[0];
  assert.equal(unknownTiming.timedAttempts, 0);
  assert.equal(unknownTiming.maximumMs, null);
  assert.equal(unknownTiming.totalMs, 0);
  const fallback = { ...historical, phase: 'controls' };
  delete fallback.sweepPhase;
  assert.equal(
    buildDiagnosticSummary({ ...report, requests: [fallback] })
      .failedRequestGroups[0].phase,
    'controls',
  );
  for (const key of ['queueWaitMs', 'headerMs', 'bodyMs', 'totalMs'])
    for (const value of [
      -1,
      null,
      undefined,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      'private',
    ])
      assert.throws(() =>
        buildDiagnosticSummary({
          ...report,
          requests: [{ ...record, route: templates[0], [key]: value }],
        }),
      );
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      requests: [
        { ...record, route: templates[0], totalMs: Number.MAX_SAFE_INTEGER },
        { ...record, route: templates[0] },
      ],
    }),
  );
  for (const key of ['abortSource', 'errorName', 'errorCode'])
    assert.throws(() =>
      buildDiagnosticSummary({
        ...report,
        requests: [{ ...record, route: templates[0], [key]: 'private' }],
      }),
    );
});

test('summary carries validated fixed mail tuples while historical and absent attribution stay unknown', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const { zeroMailStats } = await import('./local-mail-stub.mjs');
  const report = { sourceSha: 'a'.repeat(40), mailStats: zeroMailStats() };
  assert.equal(buildDiagnosticSummary(report).mailAttributionAvailable, true);
  report.mailStats.rejected.path = 1;
  report.mailStats.rejectedRequests = [
    {
      method: 'GET',
      route: 'systemNotifications',
      authorization: 'matched',
      reason: 'path',
      count: 1,
    },
  ];
  assert.deepEqual(buildDiagnosticSummary(report).mail, report.mailStats);
  delete report.mailStats.rejectedRequests;
  delete report.mailStats.probeRequests;
  assert.equal(buildDiagnosticSummary(report).mailAttributionAvailable, false);
  report.mailStats.rejectedRequests = [];
  assert.throws(() => buildDiagnosticSummary(report));
});

test('sanitized summary preserves independent probe history without inventing historical counts', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const { zeroMailStats } = await import('./local-mail-stub.mjs');
  const report = {
    sourceSha: 'a'.repeat(40),
    mailStats: zeroMailStats(),
    private: 'private-body-token',
  };
  report.mailStats.probeRequests = {
    health: 3,
    systemNotificationsUnavailable: 1,
  };
  assert.deepEqual(
    buildDiagnosticSummary(report).mail.probeRequests,
    report.mailStats.probeRequests,
  );
  assert.equal(buildDiagnosticSummary(report).mailAttributionAvailable, true);
  delete report.mailStats.rejectedRequests;
  assert.equal(buildDiagnosticSummary(report).mailAttributionAvailable, false);
  assert.deepEqual(buildDiagnosticSummary(report).mail.probeRequests, {
    health: 3,
    systemNotificationsUnavailable: 1,
  });
  delete report.mailStats.probeRequests;
  assert.equal(
    Object.hasOwn(buildDiagnosticSummary(report).mail, 'probeRequests'),
    false,
  );
  assert.equal(
    JSON.stringify(buildDiagnosticSummary(report)).includes(
      'private-body-token',
    ),
    false,
  );
});

test('summary accepts only fixed validated causal evidence and leaves historical reports unchanged', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const { joinCausalEvidence } = await import('./causal-evidence.mjs');
  const report = {
    sourceSha: 'a'.repeat(40),
    requests: [],
    inventoryTemplates: [],
  };
  assert.equal(
    Object.hasOwn(buildDiagnosticSummary(report), 'causalEvidence'),
    false,
  );
  const evidence = joinCausalEvidence(report, [], { readFailure: true });
  assert.deepEqual(
    buildDiagnosticSummary({ ...report, causalEvidence: evidence })
      .causalEvidence,
    evidence,
  );
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      causalEvidence: { ...evidence, private: 'private-token' },
    }),
  );
});

test('CPU evidence validates independently and does not retroactively modify disabled summaries', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const { emptyCpuEvidence } = await import('./cpu-profile-evidence.mjs');
  const report = {
    sourceSha: 'a'.repeat(40),
    requests: [],
    inventoryTemplates: [],
  };
  assert.equal(
    Object.hasOwn(buildDiagnosticSummary(report), 'cpuProfileEvidence'),
    false,
  );
  const cpu = emptyCpuEvidence('incomplete', 'workerMissing');
  assert.deepEqual(
    buildDiagnosticSummary({ ...report, cpuProfileEvidence: cpu })
      .cpuProfileEvidence,
    cpu,
  );
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      cpuProfileEvidence: { ...cpu, privateProfile: 'SECRET_TOKEN' },
    }),
  );
  assert.equal(
    Object.hasOwn(
      buildDiagnosticSummary({ ...report, cpuProfileEvidence: cpu }),
      'causalEvidence',
    ),
    false,
  );
});

test('setup projection conserves every fixed group and excludes secret-bearing fields', async () => {
  const { buildDiagnosticSummary, sanitizeSetupAttempt } = await import(
    './core.mjs'
  );
  const attempt = {
    phase: 'fixture',
    fixtureStage: 'verified-signin',
    fixtureActor: 'B',
    method: 'POST',
    path: '/v1/auth/sign-in/email',
    status: 429,
    attempt: 1,
    isRetry: true,
    retryReason: 'fixture-auth-throttle',
    plannedRetryWaitMs: 1001,
    durationMs: 3,
    body: 'secret-canary',
    headers: { token: 'secret-canary' },
    error: 'secret-canary',
    sequence: 999,
  };
  const requests = [
    { ...attempt },
    { ...attempt, attempt: 2 },
    {
      ...attempt,
      status: 200,
      attempt: 3,
      isRetry: false,
      retryReason: undefined,
      plannedRetryWaitMs: undefined,
    },
    { phase: 'warmup', method: 'GET', path: '/v1/health', status: 200 },
    {
      phase: 'fixture',
      method: 'GET',
      path: '/v1/brands?organizationId=secret-canary',
      status: 200,
    },
  ];
  const report = {
    sourceSha: 'a'.repeat(40),
    requests,
    fixtureProof: {},
    setupFailure: { source: 'attached', record: attempt },
  };
  const evidence = buildDiagnosticSummary(report).setupEvidence;
  assert.equal(evidence.attemptCount, 5);
  assert.equal(evidence.retryCount, 2);
  assert.equal(evidence.authThrottleRetries, 2);
  assert.equal(evidence.plannedRetryWaitMs, 2002);
  assert.equal(
    evidence.groups.reduce((n, g) => n + g.count, 0),
    5,
  );
  assert.equal(
    evidence.groups.reduce((n, g) => n + g.plannedRetryWaitMs, 0),
    2002,
  );
  assert.equal(evidence.failure.source, 'attached');
  assert.equal(evidence.failure.lastAttempt.attempt, 1);
  assert.equal(
    evidence.groups.find((g) => g.route === '/v1/brands').actor,
    'unknown',
  );
  assert.equal(sanitizeSetupAttempt(requests[3]).durationMs, null);
  assert.equal(sanitizeSetupAttempt(requests[3]).attempt, null);
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /secret-canary|sequence|headers|body|error/,
  );
  assert.deepEqual(buildDiagnosticSummary(report).setupEvidence, evidence);
  assert.deepEqual(
    buildDiagnosticSummary({ ...report, setupFailure: undefined }).setupEvidence
      .failure,
    { source: 'unavailable', lastAttempt: null },
  );
  assert.equal(
    buildDiagnosticSummary({
      ...report,
      fixtureProof: {
        verificationRequired: true,
        noUnverifiedSession: true,
        acceptedMail: true,
        verifiedAuthentication: true,
      },
      setupFailure: undefined,
    }).setupEvidence.failure,
    null,
  );
});
test('setup evidence rejects malformed numbers, group overflow and unsafe proof', async () => {
  const { buildDiagnosticSummary, sanitizeSetupAttempt } = await import(
    './core.mjs'
  );
  for (const [key, value] of [
    ['status', 600],
    ['status', -1],
    ['attempt', 0],
    ['attempt', 1.5],
    ['durationMs', NaN],
    ['durationMs', null],
    ['attempt', null],
    ['plannedRetryWaitMs', Infinity],
    ['plannedRetryWaitMs', -1],
  ])
    assert.throws(() =>
      sanitizeSetupAttempt({ phase: 'fixture', status: 200, [key]: value }),
    );
  assert.throws(
    () =>
      buildDiagnosticSummary({
        sourceSha: 'a'.repeat(40),
        requests: Array.from({ length: 257 }, (_, status) => ({
          phase: 'fixture',
          status: status + 1,
        })),
      }),
    /group limit/,
  );
  assert.throws(() =>
    buildDiagnosticSummary({
      sourceSha: 'a'.repeat(40),
      requests: [0, 1].map(() => ({
        phase: 'fixture',
        status: 200,
        plannedRetryWaitMs: Number.MAX_SAFE_INTEGER,
      })),
    }),
  );
  for (const proof of [
    false,
    0,
    '',
    [],
    { unknown: true },
    { acceptedMail: 'true' },
  ])
    assert.throws(
      () => buildDiagnosticSummary({ sourceSha: 'a'.repeat(40) }, proof),
      /Unsafe fixture proof/,
    );
  const unknown = sanitizeSetupAttempt({
    phase: 'canary',
    fixtureActor: 'canary',
    fixtureStage: 'canary',
    method: 'canary',
    path: '/v1/auth/sign-in/email?canary',
    status: 0,
  });
  assert.equal(unknown.phase, 'unknown');
  assert.equal(unknown.actor, 'unknown');
  assert.equal(unknown.stage, 'other');
  assert.equal(unknown.method, 'other');
  assert.equal(unknown.route, 'unknown');
});

test('historical complete false setup proof remains unknown failure attribution', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const report = {
    sourceSha: 'a'.repeat(40),
    fixtureProof: {
      verificationRequired: true,
      noUnverifiedSession: true,
      acceptedMail: false,
      verifiedAuthentication: true,
    },
  };
  assert.deepEqual(
    buildDiagnosticSummary(report, report.fixtureProof).setupEvidence.failure,
    { source: 'unavailable', lastAttempt: null },
  );
});

test('tenant and failure evidence independently conserves canonical responses and uncorrelated logs', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const message =
    'Tenant isolation: findMany on Post used organizationId secret-canary but the request tenant is secret-canary.';
  const report = {
    sourceSha: 'a'.repeat(40),
    inventoryTemplates: ['/v1/posts'],
    requests: [
      {
        actor: 'S:A',
        sweepPhase: 'superadminOverrideGets',
        phase: 'get',
        method: 'GET',
        route: '/v1/posts',
        path: '/v1/posts?token=secret-canary',
        status: 500,
        hasTenantHit: true,
        message,
      },
      {
        actor: 'M:A',
        sweepPhase: 'memberAGets',
        method: 'GET',
        route: '/v1/posts',
        status: 500,
        hasTenantHit: true,
        message:
          'Tenant isolation: findMany on Post is missing organizationId in CLOUD mode.',
      },
    ],
    apiLogHits: [
      { message, phase: 'strict', url: 'secret-canary' },
      {
        message,
        phase: 'superadminOverrideGets',
        actor: 'S:A',
        route: '/v1/posts',
      },
    ],
    tenantHitGroups: [{}, {}],
    failures: [
      'Harness required proof or execution failed',
      'M:A: only 2 GET requests reached the API without auth/throttle/transport failure (minimum 4; 1 timeouts reported separately)',
      'secret-canary',
    ],
  };
  const summary = buildDiagnosticSummary(report);
  assert.equal(summary.tenantEvidence.responseHits, 2);
  assert.equal(summary.tenantEvidence.logHits, 2);
  assert.equal(summary.tenantEvidence.observedGroupedFindings, 2);
  assert.equal(
    summary.tenantEvidence.responseGroups.find((g) => g.actor === 'S:A').reason,
    'organization-id-mismatch',
  );
  assert.ok(
    summary.tenantEvidence.logGroups.every(
      (g) => g.actor === 'unknown' && g.route === 'unknown',
    ),
  );
  assert.equal(summary.failureEvidence.total, 3);
  assert.equal(
    summary.failureEvidence.groups.find(
      (g) => g.label === 'get-completion-coverage',
    ).timeouts,
    1,
  );
  assert.doesNotMatch(JSON.stringify(summary), /secret-canary/);
});

test('tenant schema/operation allowlists match checked-in source and unknown inputs never expose canaries', async () => {
  const { buildDiagnosticSummary, TENANT_EVIDENCE_OPERATIONS } = await import(
    './core.mjs'
  );
  const source = readFileSync(
    new URL(
      '../../../packages/libs/prisma/discover-tenant-models.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const block = source.match(/TENANT_QUERY_OPERATIONS = \[([\s\S]*?)\]/)[1];
  assert.deepEqual(
    TENANT_EVIDENCE_OPERATIONS,
    [...block.matchAll(/'([^']+)'/g)].map((x) => x[1]),
  );
  const schema = readFileSync(
    new URL('../../../packages/prisma/prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  assert.match(schema, /^model Post \{/m);
  const messages = [
    'TenantIsolationError secret-canary',
    'Tenant isolation: secretOperation on Post is missing organizationId in CLOUD mode.',
    'Tenant isolation: findMany on SecretModel is missing organizationId in CLOUD mode.',
    'Tenant isolation: findMany on Post used billingAccountId secret-canary without an active BillingAccountScope in CLOUD mode.',
  ];
  const report = {
    sourceSha: 'a'.repeat(40),
    inventoryTemplates: ['/v1/posts'],
    requests: messages.map((message) => ({
      status: 403,
      hasTenantHit: true,
      message,
      actor: 'secret-canary',
      phase: 'secret-canary',
      method: 'SQL',
      route: '/v1/posts?secret-canary',
      path: 'secret-canary',
      body: 'secret-canary',
      headers: { cookie: 'secret-canary' },
      stack: 'secret-canary',
    })),
    apiLogHits: messages,
  };
  const e = buildDiagnosticSummary(report).tenantEvidence;
  assert.equal(e.responseHits, 4);
  assert.equal(e.logHits, 4);
  assert.equal(e.observedGroupedFindings, null);
  assert.equal(
    e.responseGroups.reduce((n, g) => n + g.count, 0),
    4,
  );
  assert.equal(
    e.logGroups.reduce((n, g) => n + g.count, 0),
    4,
  );
  assert.ok(
    e.responseGroups.every(
      (g) =>
        g.actor === 'unknown' && g.route === 'unknown' && g.phase === 'unknown',
    ),
  );
  assert.ok(e.responseGroups.some((g) => g.model === 'unknown'));
  assert.ok(e.responseGroups.some((g) => g.operation === 'unknown'));
  assert.ok(
    e.responseGroups.some((g) => g.reason === 'billing-account-id-mismatch'),
  );
  assert.doesNotMatch(
    JSON.stringify(e),
    /secret-canary|SecretModel|secretOperation|cookie|body|stack/,
  );
  const empty = buildDiagnosticSummary({ sourceSha: 'a'.repeat(40) });
  assert.deepEqual(empty.tenantEvidence.responseGroups, []);
  assert.deepEqual(empty.failureEvidence, { version: 1, total: 0, groups: [] });
  assert.throws(() =>
    buildDiagnosticSummary({
      ...report,
      requests: [{ ...report.requests[0], status: 600 }],
    }),
  );
  assert.throws(() =>
    buildDiagnosticSummary({ ...report, tenantHitGroups: { length: 1 } }),
  );
  assert.throws(() => buildDiagnosticSummary({ ...report, failures: [{}] }));
});
test('failure evidence conserves exact fixed/dynamic labels and source count fields', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const failures = [
    'Only 2 GET routes discovered (minimum 100)',
    'Only 3 distinct tools discovered (minimum 20)',
    'M:A: only 2/4 GET routes attempted',
    'S:A: only 2 GET requests reached the API without auth/throttle/transport failure (minimum 4; 1 timeouts reported separately)',
    'M:A: 2/4 tool requests attempted',
    'S: 2/4 tool requests reached the API',
    'S: only 2 tools accepted (minimum 4)',
    '2/40 requests timed out (5.00%; maximum 0 unresolved requests)',
    '2 unresolved timeout/transport requests cannot prove tenant safety',
    'Harness required proof or execution failed',
    'Fixture setup proof unavailable',
    'Fixture setup proof incomplete',
    'Restricted transport recorded rejected requests',
    'Causal diagnostic evidence unavailable',
    'CPU profile diagnostic evidence unavailable',
    'Final diagnostic evidence unavailable',
    'CPU profile trigger unavailable',
    'Sweep exceeded its 480-second wall-clock budget',
    'Harness exceeded its 570-second overall budget',
    'Sweep did not produce a JSON report',
    'Cannot read final API stdout log',
    'Expand/request canary',
    'Tool canary',
    'Disconnect fixture client: canary',
    'Cannot scan API stdout: canary',
    'Cannot load superadmin override baseline: canary',
    'unknown canary',
    'unknown canary',
  ];
  const e = buildDiagnosticSummary({
    sourceSha: 'a'.repeat(40),
    failures,
  }).failureEvidence;
  assert.equal(e.total, failures.length);
  assert.equal(
    e.groups.reduce((n, g) => n + g.count, 0),
    failures.length,
  );
  assert.equal(e.groups.find((g) => g.label === 'unknown').count, 2);
  assert.equal(
    e.groups.find((g) => g.label === 'get-inventory-minimum').expected,
    100,
  );
  assert.equal(
    e.groups.find((g) => g.label === 'get-completion-coverage').timeouts,
    1,
  );
  assert.equal(
    e.groups.find((g) => g.label === 'get-completion-coverage').actor,
    'S:A',
  );
  assert.ok(
    e.groups
      .filter((g) => g.label !== 'get-completion-coverage')
      .every((g) => g.timeouts === null),
  );
  assert.ok(
    e.groups.some(
      (g) => g.label === 'unresolved-request-failure' && g.expected === 0,
    ),
  );
  assert.doesNotMatch(JSON.stringify(e), /canary/);
  assert.throws(() =>
    buildDiagnosticSummary({
      sourceSha: 'a'.repeat(40),
      failures: ['Only 9007199254740992 GET routes discovered (minimum 100)'],
    }),
  );
  assert.throws(
    () =>
      buildDiagnosticSummary({
        sourceSha: 'a'.repeat(40),
        failures: Array.from(
          { length: 257 },
          (_, i) => `Only ${i} GET routes discovered (minimum 100)`,
        ),
      }),
    /Too many failure/,
  );
});
test('tenant response grouping cap rejects overflow without truncation', async () => {
  const { buildDiagnosticSummary } = await import('./core.mjs');
  const paths = Array.from({ length: 10001 }, (_, i) => `/v1/fixed-${i}`);
  assert.throws(
    () =>
      buildDiagnosticSummary({
        sourceSha: 'a'.repeat(40),
        inventoryTemplates: paths,
        requests: paths.map((route) => ({
          route,
          status: 500,
          hasTenantHit: true,
          message: 'TenantIsolationError',
        })),
      }),
    /Too many tenant response/,
  );
});

test('v19 partitions 609 ordinary completions and four exact machine denials without waiving arbitrary 401', () => {
  const templates = [
    '/v1/internal/integrations/{platform}',
    '/v1/internal/integrations/{platform}/{id}',
    '/v1/internal/platform-runtime-settings',
    '/v1/internal/orgs/{orgId}/workflow-executions/{id}',
  ];
  const routes = [
    ...Array.from({ length: 609 }, (_, i) => `/v1/example-${i}`),
    ...templates,
  ];
  const records = ['M:A', 'M2:B', 'S', 'S:A'].flatMap((actor) =>
    routes.map((route) => ({
      actor,
      route,
      phase: 'get',
      status: templates.includes(route) ? 401 : 200,
    })),
  );
  records.push(
    ...['M:A', 'S'].flatMap((actor) =>
      Array.from({ length: 20 }, (_, i) => ({
        actor,
        route: `/v1/agent-tools/tool${i}/execute`,
        phase: 'tool',
        status: 200,
      })),
    ),
  );
  records.push(
    ...templates.map((route) => ({
      actor: 'MACHINE',
      route,
      phase: 'machineGets',
      sweepPhase: 'machineGets',
      status: 200,
      machineDataAsserted: true,
    })),
  );
  assert.deepEqual(coverageErrors(records, 613, 20, 20, routes), []);
  const broken = records.map((record) =>
    record.route === '/v1/example-0' ? { ...record, status: 401 } : record,
  );
  assert.ok(coverageErrors(broken, 613, 20, 20, routes).length);
});
