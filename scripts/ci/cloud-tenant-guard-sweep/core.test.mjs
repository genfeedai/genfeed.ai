import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  concurrentMap,
  coverageErrors,
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

test('all four GET contexts run together with 16 requests each and independent member users', async () => {
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
  assert.equal(peak, 64);
  assert.deepEqual([...peaks.values()], [16, 16, 16, 16]);
});

test('tool phases parallelize both actors at 16/8/4 and wait for all prior work', async () => {
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
  const active = new Map();
  const peaks = new Map();
  const phases = [];
  const finished = { readOnlyTools: 0, writeTools: 0, destructiveTools: 0 };
  let phase;
  await sweepTools(
    tools,
    contexts,
    (name) => name.startsWith('read_'),
    async ({ actor }) => {
      if (phase === 'writeTools') assert.equal(finished.readOnlyTools, 132);
      if (phase === 'destructiveTools') assert.equal(finished.writeTools, 66);
      const key = `${phase}/${actor.label}`;
      active.set(key, (active.get(key) ?? 0) + 1);
      peaks.set(key, Math.max(peaks.get(key) ?? 0, active.get(key)));
      await Promise.resolve();
      active.set(key, active.get(key) - 1);
      finished[phase]++;
    },
    async (name, run) => {
      phase = name;
      phases.push(name);
      await run();
      assert.ok([...active.values()].every((count) => count === 0));
    },
  );
  assert.deepEqual(phases, ['readOnlyTools', 'writeTools', 'destructiveTools']);
  assert.deepEqual([...peaks.values()], [16, 16, 8, 8, 4, 4]);
  assert.deepEqual(finished, {
    readOnlyTools: 132,
    writeTools: 66,
    destructiveTools: 66,
  });
});

test('timeouts up to 5% warn, over 5% fail, and retries do not dilute evidence', () => {
  assert.equal(timeoutStats([]).hasExceededLimit, false);
  const requests = Array.from({ length: 100 }, (_, index) => ({
    isTimeout: index < 5,
  }));
  assert.deepEqual(timeoutStats(requests), {
    count: 5,
    requests: 100,
    ratio: 0.05,
    hasExceededLimit: false,
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
  assert.deepEqual(coverageErrors(minimumCoverage, 100, 20), []);
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
  assert.deepEqual(coverageErrors(covered, 120, 20), []);
  for (let index = 0; index < 25; index++) {
    covered[index].isTimeout = true;
    covered[index].status = 0;
  }
  assert.ok(
    coverageErrors(covered, 120, 20).some((error) =>
      error.includes('maximum 5%'),
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
    hasExceededLimit: false,
  });
  sweep[5].isTimeout = true;
  assert.equal(timeoutStats([...setup, ...sweep]).ratio, 0.06);
  assert.equal(timeoutStats([...setup, ...sweep]).hasExceededLimit, true);
  const controls = [{ phase: 'controls', isTimeout: true }, { phase: 'tool' }];
  assert.equal(timeoutStats([...setup, ...controls]).ratio, 0.5);
});

test('coverage gate ignores fixture timeouts but still fails above 5% sweep timeouts', () => {
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
      message.includes('maximum 5%'),
    ),
  );
});
