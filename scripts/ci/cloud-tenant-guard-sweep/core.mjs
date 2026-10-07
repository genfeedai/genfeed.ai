import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateCausalEvidence } from './causal-evidence.mjs';
import { validateCpuEvidence } from './cpu-profile-evidence.mjs';
import { validateMailStats } from './local-mail-stub.mjs';
import { MACHINE_TEMPLATES, machineCoverage } from './machine-fixture.mjs';

export function createDeadline(
  timeoutMs,
  {
    parentSignal,
    parentAbortSources,
    source = 'unknown',
    now = () => performance.now(),
  } = {},
) {
  const expiresAt = now() + timeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = parentSignal
    ? AbortSignal.any([timeout, parentSignal])
    : timeout;
  return {
    signal,
    abortSources: [
      { signal: timeout, source },
      ...(parentAbortSources ??
        (parentSignal ? [{ signal: parentSignal, source: 'unknown' }] : [])),
    ],
    remaining() {
      signal.throwIfAborted();
      const remaining = Math.ceil(expiresAt - now());
      if (remaining <= 0) throw new Error('Harness deadline exceeded');
      return remaining;
    },
  };
}

// Exact OpenAPI templates only. JSON exports and persisted event lists are
// deliberately swept; these routes send files, rather than JSON responses.
export const GET_SKIPS = new Map([
  ['/v1/analytics/export', 'CSV/XLSX attachment'],
  ['/v1/costs/export', 'CSV attachment'],
  ['/v1/costs/workflows/export', 'CSV attachment'],
  ['/v1/costs/usage/export', 'CSV attachment'],
  ['/v1/brands/{id}/brand-os/design.md', 'Markdown file download'],
  ['/v1/public/brand-os/{publicationId}/design.md', 'Markdown file download'],
  [
    '/v1/public/brand-os/{publicationId}/{revisionId}/design.md',
    'Markdown file download',
  ],
  ['/v1/public/images/{imageId}/image.jpg', 'Binary image response'],
  ['/v1/public/videos/{videoId}/video.mp4', 'Binary video response'],
  ['/v1/public/musics/{musicId}/audio.mp3', 'Binary audio response'],
  ['/v1/videos/{videoId}/thumbnail', 'Binary thumbnail response'],
  [
    '/v1/visual-projects/{id}/revisions/{number}/source',
    'Source file attachment',
  ],
]);

export function normalizePath(path) {
  return /^\/v1(?:\/|$)/.test(path)
    ? path
    : `/v1${path.startsWith('/') ? '' : '/'}${path}`;
}

export function tenantHit(body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return (
    text?.match(/Tenant isolation:[^\n]*/)?.[0] ??
    (text?.includes('TenantIsolationError') ? 'TenantIsolationError' : null)
  );
}

export function logHits(log) {
  return log.split('\n').filter((line) => tenantHit(line));
}

export function requiredEnvKeys(sources) {
  const keys = new Set();
  for (const source of sources) {
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const matches = [
      ...code.matchAll(/\b([A-Z][A-Z0-9_]+)\s*:\s*conditionalRequired\s*\(/g),
    ];
    if (
      matches.length !==
      [...code.matchAll(/\bconditionalRequired\s*\(/g)].length
    ) {
      throw new Error(
        'Unrecognized conditionalRequired declaration; update CI env-key derivation',
      );
    }
    for (const match of matches) keys.add(match[1]);
  }
  return [...keys].sort();
}

export function parseEnv(source) {
  return Object.fromEntries(
    source
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const COLLECTION_IDS = {
  organizations: 'organizationId',
  brands: 'brandId',
  users: 'userId',
  personas: 'personaId',
  characters: 'personaId',
  grants: 'grantId',
  workflows: 'workflowId',
  members: 'memberId',
};

export function parameterValue(name, path, fixture) {
  if (fixture[name]) return fixture[name];
  if (name === 'characterId') return fixture.personaId ?? randomUUID();
  if (name === 'id') {
    const collection = path
      .split('/{id}')[0]
      .split('/')
      .filter(Boolean)
      .findLast((part) => COLLECTION_IDS[part]);
    return fixture[COLLECTION_IDS[collection]] ?? randomUUID();
  }
  if (/^(number|page|limit|offset|sequence|afterSequence)$/.test(name))
    return 1;
  if (name === 'slug') return fixture.organizationSlug ?? 'ci-placeholder';
  return /id$/i.test(name) ? randomUUID() : 'ci-placeholder';
}

export function schemaValue(
  schema = {},
  name = '',
  fixture = {},
  root = schema,
  depth = 0,
) {
  if (depth > 12) throw new Error(`Recursive required schema at ${name}`);
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/'))
      throw new Error(`External schema reference: ${schema.$ref}`);
    const referenced = schema.$ref
      .slice(2)
      .split('/')
      .reduce(
        (value, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')],
        root,
      );
    if (!referenced)
      throw new Error(`Missing schema reference: ${schema.$ref}`);
    return schemaValue(referenced, name, fixture, root, depth + 1);
  }
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length)
    return schema.enum.find((value) => value !== null) ?? null;
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives)
    return schemaValue(
      alternatives.find((entry) => entry.type !== 'null') ?? alternatives[0],
      name,
      fixture,
      root,
      depth + 1,
    );
  if (schema.allOf)
    return Object.assign(
      {},
      ...schema.allOf.map((entry) =>
        schemaValue(entry, name, fixture, root, depth + 1),
      ),
    );
  const type = Array.isArray(schema.type)
    ? schema.type.find((value) => value !== 'null')
    : schema.type;
  if (type === 'object' || schema.properties) {
    const keys = new Set(schema.required ?? []);
    for (const key of Object.keys(schema.properties ?? {})) {
      if (keys.size >= (schema.minProperties ?? 0)) break;
      keys.add(key);
    }
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        schemaValue(
          schema.properties?.[key] ?? {},
          key,
          fixture,
          root,
          depth + 1,
        ),
      ]),
    );
  }
  if (type === 'array') {
    const count = Math.min(
      schema.maxItems ?? Infinity,
      Math.max(schema.minItems ?? 0, 1),
    );
    return Array.from({ length: count }, () =>
      schemaValue(
        schema.items ?? {},
        name.replace(/Ids$/, 'Id'),
        fixture,
        root,
        depth + 1,
      ),
    );
  }
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  if (type === 'integer' || type === 'number')
    return Math.min(
      schema.maximum ?? Infinity,
      Math.max(schema.minimum ?? 1, (schema.exclusiveMinimum ?? -1) + 1),
    );
  if (/id$/i.test(name)) return String(parameterValue(name, '', fixture));
  if (schema.format === 'date-time') return '2026-01-01T00:00:00.000Z';
  if (schema.format === 'date') return '2026-01-01';
  if (schema.format === 'email' || /email/i.test(name))
    return 'ci-placeholder@example.invalid';
  if (schema.format === 'uuid') return randomUUID();
  if (name === 'aspectRatio') return '1:1';
  if (schema.format === 'uri' || /url$/i.test(name))
    return 'http://localhost:3999/ci-placeholder';
  let value = 'ci-placeholder';
  value = value
    .padEnd(schema.minLength ?? 1, 'x')
    .slice(0, schema.maxLength ?? Infinity);
  if (schema.pattern && !new RegExp(schema.pattern).test(value))
    throw new Error(`No valid placeholder for ${name}: ${schema.pattern}`);
  return value;
}

export function getRoutes(document) {
  return Object.entries(document.paths ?? {})
    .filter(([, item]) => item.get)
    .map(([path, item]) => ({
      method: 'GET',
      path: normalizePath(path),
      operationId: item.get.operationId,
      parameters: [...(item.parameters ?? []), ...(item.get.parameters ?? [])],
      skipReason: GET_SKIPS.get(normalizePath(path)),
    }));
}

export function expandRoute(route, fixture, document, override) {
  const path = route.path.replace(/\{([^}]+)\}/g, (_, name) =>
    encodeURIComponent(parameterValue(name, route.path, fixture)),
  );
  const query = new URLSearchParams();
  for (let parameter of route.parameters) {
    if (parameter.$ref)
      parameter =
        document.components?.parameters?.[parameter.$ref.split('/').at(-1)] ??
        parameter;
    if (parameter.in === 'query' && parameter.required) {
      query.set(
        parameter.name,
        String(
          schemaValue(parameter.schema, parameter.name, fixture, document),
        ),
      );
    }
  }
  if (override) query.set('organizationId', override);
  return `${path}${query.size ? `?${query}` : ''}`;
}

export function distinctTools(agent, mcp) {
  return [
    ...new Map([...agent, ...mcp].map((tool) => [tool.name, tool])).values(),
  ].sort(
    (left, right) =>
      Number(Boolean(left.annotations?.destructiveHint)) -
        Number(Boolean(right.annotations?.destructiveHint)) ||
      left.name.localeCompare(right.name),
  );
}

export function toolSkipReason(status, body) {
  if (tenantHit(body)) return null;
  if (
    (status === 400 || status === 403) &&
    /requires (?:superadmin|admin)|not callable|no agent executor wired up/.test(
      body,
    )
  )
    return body;
  if (body.includes('UNSUPPORTED_APPROVAL'))
    return 'Approval-required tool has no approvedApprovalId';
  return null;
}

export async function concurrentMap(values, concurrency, worker, signal) {
  const results = [];
  let next = 0;
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        signal?.throwIfAborted();
        const index = next++;
        results[index] = await worker(values[index], index);
      }
    }),
  );
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results;
}

export function createConcurrencyLimiter(concurrency = 10) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error('Concurrency must be a positive integer');
  let active = 0;
  const queue = [];
  const stats = { maxActive: 0, maxQueued: 0 };
  const drain = () => {
    while (active < concurrency && queue.length) {
      const { run, resolve, reject } = queue.shift();
      active++;
      stats.maxActive = Math.max(stats.maxActive, active);
      Promise.resolve()
        .then(run)
        .then(resolve, reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  };
  const limit = (run) =>
    new Promise((resolve, reject) => {
      queue.push({ run, resolve, reject });
      stats.maxQueued = Math.max(stats.maxQueued, queue.length);
      drain();
    });
  limit.stats = stats;
  return limit;
}

export function getContexts(fixture) {
  return [
    { actor: { ...fixture.member, label: 'M:A' }, organization: fixture.orgA },
    {
      actor: { ...fixture.member2, label: 'M2:B' },
      organization: fixture.orgB,
    },
    { actor: fixture.superadmin, organization: fixture.orgS },
    {
      actor: { ...fixture.superadmin, label: 'S:A' },
      organization: fixture.orgA,
      override: fixture.orgA.organizationId,
    },
  ];
}

export async function sweepGets(contexts, routes, worker, signal) {
  await concurrentMap(
    routes.flatMap((route) => contexts.map((context) => ({ context, route }))),
    10,
    ({ context, route }) => worker(context, route),
    signal,
  );
}

export async function sweepTools(
  tools,
  contexts,
  isReadOnlyToolName,
  worker,
  measure = async (_, run) => run(),
  signal,
) {
  const phases = [
    { name: 'readOnlyTools', concurrency: 10, tools: [] },
    { name: 'writeTools', concurrency: 5, tools: [] },
    { name: 'destructiveTools', concurrency: 2, tools: [] },
  ];
  for (const tool of tools) {
    const index = tool.annotations?.destructiveHint
      ? 2
      : tool.annotations?.readOnlyHint || isReadOnlyToolName(tool.name)
        ? 0
        : 1;
    phases[index].tools.push(tool);
  }
  // Only reads run as S; every distinct tool runs once as M:A.
  for (const phase of phases) {
    await measure(phase.name, () =>
      concurrentMap(
        phase.tools.flatMap((tool) =>
          (phase.name === 'readOnlyTools'
            ? contexts
            : contexts.slice(0, 1)
          ).map((context) => ({ context, tool })),
        ),
        phase.concurrency,
        ({ context, tool }) => worker(context, tool, phase.name),
        signal,
      ),
    );
  }
}

export function phaseRequestStats(requests, durations) {
  return Object.fromEntries(
    Object.keys(durations)
      .filter((phase) => phase !== 'total')
      .map((phase) => {
        const attempts = requests.filter(
          (record) => (record.sweepPhase ?? record.phase) === phase,
        );
        const final = attempts.filter((record) => !record.isRetry);
        return [
          phase,
          {
            requests: final.length,
            attempts: attempts.length,
            timeouts: final.filter((record) => record.isTimeout).length,
          },
        ];
      }),
  );
}

export function timeoutStats(requests) {
  // Setup failures stop the fixture separately. Neither setup attempts nor
  // retries may inflate or dilute the sweep's missing-evidence ratio.
  const attempted = requests.filter(
    (result) =>
      !result.isRetry && !['fixture', 'warmup'].includes(result.phase),
  );
  const count = attempted.filter(
    (result) => result.isTimeout || result.status === 0,
  ).length;
  return {
    count,
    requests: attempted.length,
    ratio: attempted.length ? count / attempted.length : 0,
    hasExceededLimit: count > 0,
  };
}

export async function measurePhase(
  durations,
  name,
  run,
  now = () => performance.now(),
) {
  const started = now();
  try {
    return await run();
  } finally {
    durations[name] = Math.round(now() - started);
  }
}

export function durationSummary(durations) {
  return [
    'Cloud tenant guard durations (seconds):',
    ...Object.entries(durations).map(
      ([phase, ms]) => `- ${phase}: ${(ms / 1_000).toFixed(2)}s`,
    ),
  ].join('\n');
}

export function groupHits(requests, lines) {
  const groups = new Map();
  const add = (route, message, actor) => {
    const match = message.match(/Tenant isolation:\s*(\w+) on (\w+)/);
    const model = match?.[2] ?? 'unknown';
    const operation = match?.[1] ?? 'unknown';
    const key = `${model}/${operation}/${route}`;
    const group = groups.get(key) ?? {
      model,
      operation,
      route,
      count: 0,
      actors: [],
      messages: [],
    };
    group.count++;
    if (!group.actors.includes(actor)) group.actors.push(actor);
    if (!group.messages.includes(message)) group.messages.push(message);
    groups.set(key, group);
  };
  for (const result of requests.filter((result) => result.hasTenantHit))
    add(
      `${result.method} ${result.route ?? result.path}`,
      result.message,
      result.actor,
    );
  for (const evidence of lines) {
    const line = typeof evidence === 'string' ? evidence : evidence.message;
    add(
      line.match(/(?:GET|POST|PATCH|DELETE|PUT)\s+\S+/)?.[0] ?? 'API stdout',
      tenantHit(line),
      'API stdout',
    );
  }
  return [...groups.values()];
}

export function coverageErrors(
  requests,
  routeCount,
  toolCount,
  readOnlyToolCount = toolCount,
  templates,
) {
  const errors = [];
  if (templates !== undefined)
    errors.push(...machineCoverage(requests, templates, true).failures);
  if (routeCount < 100)
    errors.push(`Only ${routeCount} GET routes discovered (minimum 100)`);
  if (toolCount < 20)
    errors.push(`Only ${toolCount} distinct tools discovered (minimum 20)`);
  const timeouts = timeoutStats(requests);
  if (timeouts.hasExceededLimit)
    errors.push(
      `${timeouts.count}/${timeouts.requests} requests timed out (${(timeouts.ratio * 100).toFixed(2)}%; maximum 0 unresolved requests)`,
    );
  for (const actor of ['M:A', 'M2:B', 'S', 'S:A']) {
    const attempted = requests.filter(
      (result) =>
        result.phase === 'get' && result.actor === actor && !result.isRetry,
    );
    const completed = requests.filter(
      (result) =>
        result.phase === 'get' &&
        result.actor === actor &&
        result.status > 0 &&
        result.status !== 401 &&
        result.status !== 429 &&
        !(templates && MACHINE_TEMPLATES.includes(result.route)),
    );
    const uniqueAttempted = new Set(
      attempted.map((result, index) => result.route ?? result.path ?? index),
    ).size;
    if (uniqueAttempted !== routeCount)
      errors.push(
        `${actor}: only ${uniqueAttempted}/${routeCount} GET routes attempted`,
      );
    // Timeouts remain unknown evidence, governed by the ratio gate above.
    // They must not independently fail a minimum-sized route inventory.
    const timedOut = attempted.filter((result) => result.isTimeout).length;
    const requiredCompleted =
      routeCount -
      timedOut -
      (templates &&
      MACHINE_TEMPLATES.every(
        (template) =>
          templates.filter((value) => value === template).length === 1,
      )
        ? 4
        : 0);
    if (completed.length < requiredCompleted)
      errors.push(
        `${actor}: only ${completed.length} GET requests reached the API without auth/throttle/transport failure (minimum ${requiredCompleted}; ${timedOut} timeouts reported separately)`,
      );
  }
  for (const actor of ['M:A', 'S']) {
    const expected = actor === 'S' ? readOnlyToolCount : toolCount;
    const attempted = requests.filter(
      (result) =>
        result.phase === 'tool' && result.actor === actor && !result.isRetry,
    );
    const uniqueAttempted = new Set(
      attempted.map((result, index) => result.route ?? result.path ?? index),
    ).size;
    if (uniqueAttempted !== expected)
      errors.push(
        `${actor}: ${uniqueAttempted}/${expected} tool requests attempted`,
      );
    const completed = requests.filter(
      (result) =>
        result.phase === 'tool' &&
        result.actor === actor &&
        result.status > 0 &&
        result.status !== 401 &&
        result.status !== 429,
    );
    const timedOut = attempted.filter((result) => result.isTimeout).length;
    if (completed.length + timedOut !== expected)
      errors.push(
        `${actor}: ${completed.length}/${expected} tool requests reached the API`,
      );
    const accepted = completed.filter(
      (result) =>
        !result.skipReason && ![400, 403, 404].includes(result.status),
    );
    const minimumAccepted = Math.min(10, expected);
    if (accepted.length < minimumAccepted)
      errors.push(
        `${actor}: only ${accepted.length} tools accepted (minimum ${minimumAccepted})`,
      );
  }
  return errors;
}

export const DIAGNOSTIC_PHASES = [
  'warmup',
  'fixture',
  'discovery',
  'memberAGets',
  'memberBGets',
  'superadminGets',
  'machineGets',
  'controls',
  'readOnlyTools',
  'writeTools',
  'destructiveTools',
  'superadminOverrideGets',
];
export const DIAGNOSTIC_ACTORS = [
  'anonymous',
  'A',
  'B',
  'M',
  'M2',
  'S',
  'M:A',
  'M2:B',
  'S:A',
  'MACHINE',
];
export const ABORT_SOURCES = [
  'request timeout',
  'fixture/readiness',
  'sweep',
  'overall',
  'transport',
  'unknown',
];
export const ERROR_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'OTHER',
];
export const ERROR_NAMES = [
  'TimeoutError',
  'AbortError',
  'TypeError',
  'Error',
  'OTHER',
];
export function classifyTransport(error) {
  const code = error?.code ?? error?.cause?.code;
  return {
    errorCode: ERROR_CODES.includes(code) ? code : 'OTHER',
    errorName: ERROR_NAMES.includes(error?.name) ? error.name : 'OTHER',
  };
}
export function observeAbortSources(sources) {
  let first;
  const listeners = [];
  for (const { signal, source } of sources.filter((item) => item.signal)) {
    const listener = () => {
      first ??= ABORT_SOURCES.includes(source) ? source : 'unknown';
    };
    if (signal.aborted) listener();
    else {
      signal.addEventListener('abort', listener, { once: true });
      listeners.push([signal, listener]);
    }
  }
  return {
    source: () => first,
    dispose: () => {
      for (const [signal, listener] of listeners)
        signal.removeEventListener('abort', listener);
    },
  };
}
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Unsafe diagnostic count');
  return value;
};
const FIXTURE_PROOF_KEYS = [
  'verificationRequired',
  'noUnverifiedSession',
  'acceptedMail',
  'verifiedAuthentication',
];
export function fixtureProofState(value) {
  if (value === undefined || value === null)
    return {
      available: false,
      proof: Object.fromEntries(FIXTURE_PROOF_KEYS.map((key) => [key, false])),
    };
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some(
      (key) =>
        !FIXTURE_PROOF_KEYS.includes(key) || typeof value[key] !== 'boolean',
    )
  )
    throw new Error('Unsafe fixture proof');
  const available = Object.keys(value).length === FIXTURE_PROOF_KEYS.length;
  return {
    available,
    proof: Object.fromEntries(
      FIXTURE_PROOF_KEYS.map((key) => [key, available && value[key] === true]),
    ),
  };
}
export function sanitizeSetupAttempt(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new Error('Unsafe setup attempt');
  const numeric = (key, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => {
    if (record[key] === undefined) return null;
    if (
      !Number.isSafeInteger(record[key]) ||
      record[key] < minimum ||
      record[key] > maximum
    )
      throw new Error('Unsafe setup attempt number');
    return record[key];
  };
  const phase = ['warmup', 'fixture'].includes(record.phase)
    ? record.phase
    : 'unknown';
  const stage =
    phase === 'warmup'
      ? 'warmup'
      : [
            'signup',
            'unverified-signin',
            'verified-signin',
            'token',
            'organizations',
            'brands',
          ].includes(record.fixtureStage)
        ? record.fixtureStage
        : 'other';
  const fixed = [
    '/v1/health',
    '/v1/openapi.json',
    '/v1/auth/sign-up/email',
    '/v1/auth/sign-in/email',
    '/v1/auth/token',
    '/v1/organizations',
    '/v1/brands',
  ];
  const path = typeof record.path === 'string' ? record.path : '';
  const pathname = path.split('?')[0];
  const route = fixed.includes(path)
    ? path
    : ['/v1/organizations', '/v1/brands'].includes(pathname)
      ? pathname
      : 'unknown';
  const status = numeric('status', 0, 599);
  if (status === null) throw new Error('Missing setup status');
  return {
    phase,
    stage,
    actor: ['A', 'B', 'M', 'M2', 'S'].includes(record.fixtureActor)
      ? record.fixtureActor
      : 'unknown',
    method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'DB'].includes(
      record.method,
    )
      ? record.method
      : 'other',
    route,
    status,
    attempt: numeric('attempt', 1),
    isRetry: record.isRetry === true,
    durationMs: numeric('durationMs'),
    retryReason:
      record.retryReason === 'fixture-auth-throttle'
        ? 'fixture-auth-throttle'
        : record.retryReason === undefined
          ? 'none'
          : 'other',
    plannedRetryWaitMs: numeric('plannedRetryWaitMs'),
  };
}
function buildSetupEvidence(report) {
  const attempts = (report.requests ?? [])
    .filter((record) => ['warmup', 'fixture'].includes(record.phase))
    .map(sanitizeSetupAttempt);
  const grouped = new Map();
  for (const record of attempts) {
    const { phase, stage, actor, method, route, status, isRetry, retryReason } =
      record;
    const tuple = {
      phase,
      stage,
      actor,
      method,
      route,
      status,
      isRetry,
      retryReason,
    };
    const key = JSON.stringify(tuple);
    const group = grouped.get(key) ?? {
      ...tuple,
      count: 0,
      plannedRetryWaitMs: 0,
    };
    group.count = count(group.count + 1);
    group.plannedRetryWaitMs = count(
      group.plannedRetryWaitMs + (record.plannedRetryWaitMs ?? 0),
    );
    grouped.set(key, group);
    if (grouped.size > 256) throw new Error('Setup group limit exceeded');
  }
  const groups = [...grouped.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
  const retryCount = count(attempts.filter((x) => x.isRetry).length);
  const authThrottleRetries = count(
    attempts.filter(
      (x) => x.isRetry && x.retryReason === 'fixture-auth-throttle',
    ).length,
  );
  const plannedRetryWaitMs = attempts.reduce(
    (sum, x) => count(sum + (x.plannedRetryWaitMs ?? 0)),
    0,
  );
  const attemptCount = count(attempts.length);
  if (
    groups.reduce((sum, x) => count(sum + x.count), 0) !== attemptCount ||
    groups
      .filter((x) => x.isRetry)
      .reduce((sum, x) => count(sum + x.count), 0) !== retryCount ||
    groups
      .filter((x) => x.isRetry && x.retryReason === 'fixture-auth-throttle')
      .reduce((sum, x) => count(sum + x.count), 0) !== authThrottleRetries ||
    groups.reduce((sum, x) => count(sum + x.plannedRetryWaitMs), 0) !==
      plannedRetryWaitMs
  )
    throw new Error('Nonconserved setup evidence');
  const proof = fixtureProofState(report.fixtureProof);
  const descriptor = report.setupFailure;
  let failure = null;
  if (
    descriptor !== undefined ||
    !proof.available ||
    Object.values(proof.proof).some((value) => value === false)
  ) {
    const source =
      ['attached', 'last-observed'].includes(descriptor?.source) &&
      descriptor?.record
        ? descriptor.source
        : 'unavailable';
    failure = {
      source,
      lastAttempt:
        source === 'unavailable'
          ? null
          : sanitizeSetupAttempt(descriptor.record),
    };
    if (
      failure.lastAttempt?.method !== 'DB' &&
      failure.lastAttempt?.attempt > 3
    )
      throw new Error('Unsafe setup retry attempt');
  }
  return {
    version: 1,
    attemptCount,
    retryCount,
    authThrottleRetries,
    plannedRetryWaitMs,
    groups,
    failure,
  };
}

export const TENANT_EVIDENCE_OPERATIONS = [
  'aggregate',
  'count',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
];
let tenantModels;
function schemaModels() {
  if (!tenantModels) {
    const schema = readFileSync(
      new URL('../../../packages/prisma/prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    tenantModels = new Set(
      [...schema.matchAll(/^model ([A-Za-z_][A-Za-z0-9_]*) \{/gm)].map(
        (match) => match[1],
      ),
    );
    if (!tenantModels.size) {
      tenantModels = undefined;
      throw new Error('Missing tenant diagnostic schema models');
    }
  }
  return tenantModels;
}
function tenantClassification(message) {
  const text = typeof message === 'string' ? message : '';
  const match = text.match(
    /Tenant isolation: ([A-Za-z_][A-Za-z0-9_]*) on ([A-Za-z_][A-Za-z0-9_]*)(?= |$)/,
  );
  const model = schemaModels().has(match?.[2]) ? match[2] : 'unknown';
  const operation = TENANT_EVIDENCE_OPERATIONS.includes(match?.[1])
    ? match[1]
    : 'unknown';
  let reason = 'unknown';
  if (match) {
    const tail = text.slice(match.index + match[0].length);
    if (tail.startsWith(' is missing organizationId in CLOUD mode.'))
      reason = 'missing-organization-id';
    else if (
      /^ used organizationId [^\r\n]* but the request tenant is [^\r\n]*/.test(
        tail,
      )
    )
      reason = 'organization-id-mismatch';
    else if (
      /^ used billingAccountId [^\r\n]* without an active BillingAccountScope in CLOUD mode\./.test(
        tail,
      )
    )
      reason = 'billing-account-id-mismatch';
  }
  return { model, operation, reason };
}
function diagnosticGroups(values, maximum, label) {
  const groups = new Map();
  for (const tuple of values) {
    const key = JSON.stringify(tuple);
    const group = groups.get(key) ?? { ...tuple, count: 0 };
    group.count = count(group.count + 1);
    groups.set(key, group);
    if (groups.size > maximum) throw new Error(`Too many ${label} groups`);
  }
  const result = [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
  if (
    result.reduce((sum, group) => count(sum + group.count), 0) !==
    count(values.length)
  )
    throw new Error('Nonconserved diagnostic groups');
  return result;
}
function buildTenantEvidence(report, templates) {
  schemaModels();
  const responses = (report.requests ?? [])
    .filter((request) => request.hasTenantHit === true)
    .map((request) => {
      if (
        !Number.isInteger(request.status) ||
        request.status < 0 ||
        request.status > 599
      )
        throw new Error('Invalid tenant response status');
      return {
        actor: DIAGNOSTIC_ACTORS.includes(request.actor)
          ? request.actor
          : 'unknown',
        phase: DIAGNOSTIC_PHASES.includes(request.sweepPhase)
          ? request.sweepPhase
          : DIAGNOSTIC_PHASES.includes(request.phase)
            ? request.phase
            : 'unknown',
        method: [
          'GET',
          'POST',
          'PATCH',
          'PUT',
          'DELETE',
          'OPTIONS',
          'HEAD',
        ].includes(request.method)
          ? request.method
          : 'other',
        route: templates.has(request.route) ? request.route : 'unknown',
        status: request.status,
        ...tenantClassification(request.message),
      };
    });
  const logs = (report.apiLogHits ?? []).map((record) => {
    if (
      typeof record !== 'string' &&
      (!record ||
        typeof record !== 'object' ||
        typeof record.message !== 'string')
    )
      throw new Error('Unsafe tenant log evidence');
    return {
      logPartition: ['strict', 'superadminOverrideGets'].includes(record.phase)
        ? record.phase
        : 'unknown',
      actor: 'unknown',
      route: 'unknown',
      ...tenantClassification(
        typeof record === 'string' ? record : record.message,
      ),
    };
  });
  if (
    report.tenantHitGroups !== undefined &&
    !Array.isArray(report.tenantHitGroups)
  )
    throw new Error('Invalid observed tenant findings');
  return {
    version: 1,
    responseHits: count(responses.length),
    logHits: count(logs.length),
    observedGroupedFindings:
      report.tenantHitGroups === undefined
        ? null
        : count(report.tenantHitGroups.length),
    responseGroups: diagnosticGroups(responses, 10000, 'tenant response'),
    logGroups: diagnosticGroups(logs, 10000, 'tenant log'),
  };
}
const STATIC_FAILURE_LABELS = new Map([
  ...[
    'machine-route-inventory',
    'machine-authorization-denial',
    'machine-data-coverage',
  ].map((label) => [label, label]),
  [
    'Harness required proof or execution failed',
    'harness-required-proof-or-execution',
  ],
  ['Fixture setup proof unavailable', 'fixture-proof-unavailable'],
  ['Fixture setup proof incomplete', 'fixture-proof-incomplete'],
  [
    'Restricted transport recorded rejected requests',
    'restricted-transport-refusal',
  ],
  ['Causal diagnostic evidence unavailable', 'causal-diagnostic-unavailable'],
  [
    'CPU profile diagnostic evidence unavailable',
    'cpu-profile-diagnostic-unavailable',
  ],
  ['Final diagnostic evidence unavailable', 'final-diagnostic-unavailable'],
  ['CPU profile trigger unavailable', 'cpu-trigger-unavailable'],
  ['Sweep exceeded its 480-second wall-clock budget', 'sweep-budget'],
  ['Harness exceeded its 570-second overall budget', 'overall-budget'],
  ['Sweep did not produce a JSON report', 'missing-report'],
  ['Cannot read final API stdout log', 'final-api-log-unavailable'],
]);
function failureClassification(value) {
  if (typeof value !== 'string') throw new Error('Unsafe failure evidence');
  const tuple = {
    label: STATIC_FAILURE_LABELS.get(value) ?? 'unknown',
    actor: 'unknown',
    actual: null,
    expected: null,
    timeouts: null,
  };
  const actor = '(A|B|M2|M|S:A|M:A|M2:B|S)';
  const rules = [
    [
      /^Only (\d+) GET routes discovered \(minimum (\d+)\)$/,
      'get-inventory-minimum',
      false,
    ],
    [
      /^Only (\d+) distinct tools discovered \(minimum (\d+)\)$/,
      'tool-inventory-minimum',
      false,
    ],
    [
      new RegExp(`^${actor}: only (\\d+)/(\\d+) GET routes attempted$`),
      'get-attempt-coverage',
      true,
    ],
    [
      new RegExp(
        `^${actor}: only (\\d+) GET requests reached the API without auth/throttle/transport failure \\(minimum (\\d+); (\\d+) timeouts reported separately\\)$`,
      ),
      'get-completion-coverage',
      true,
    ],
    [
      new RegExp(`^${actor}: (\\d+)/(\\d+) tool requests attempted$`),
      'tool-attempt-coverage',
      true,
    ],
    [
      new RegExp(`^${actor}: (\\d+)/(\\d+) tool requests reached the API$`),
      'tool-completion-coverage',
      true,
    ],
    [
      new RegExp(`^${actor}: only (\\d+) tools accepted \\(minimum (\\d+)\\)$`),
      'tool-acceptance-minimum',
      true,
    ],
  ];
  for (const [regex, label, hasActor] of rules) {
    const match = value.match(regex);
    if (match) {
      const offset = hasActor ? 2 : 1;
      return {
        label,
        actor: hasActor ? match[1] : 'unknown',
        actual: count(Number(match[offset])),
        expected: count(Number(match[offset + 1])),
        timeouts:
          label === 'get-completion-coverage'
            ? count(Number(match[offset + 2]))
            : null,
      };
    }
  }
  const timeoutRatio = value.match(
    /^(\d+)\/(\d+) requests timed out \(\d+\.\d{2}%; maximum (\d+) unresolved requests\)$/,
  );
  if (timeoutRatio) {
    count(Number(timeoutRatio[2]));
    return {
      ...tuple,
      label: 'unresolved-request-failure',
      actual: count(Number(timeoutRatio[1])),
      expected: count(Number(timeoutRatio[3])),
    };
  }
  const unresolved = value.match(
    /^(\d+) unresolved timeout\/transport requests cannot prove tenant safety$/,
  );
  if (unresolved)
    return {
      ...tuple,
      label: 'unresolved-request-failure',
      actual: count(Number(unresolved[1])),
    };
  for (const [prefix, label] of [
    ['Expand/request ', 'route-request'],
    ['Tool ', 'tool-request'],
    ['Disconnect fixture client: ', 'fixture-disconnect'],
    ['Cannot scan API stdout: ', 'api-log-read'],
    ['Cannot load superadmin override baseline: ', 'baseline-read'],
  ])
    if (value.startsWith(prefix)) return { ...tuple, label };
  return tuple;
}
function buildFailureEvidence(report) {
  const failures = report.failures ?? [];
  if (!Array.isArray(failures)) throw new Error('Unsafe failure list');
  return {
    version: 1,
    total: count(failures.length),
    groups: diagnosticGroups(
      failures.map(failureClassification),
      256,
      'failure',
    ),
  };
}

export function buildDiagnosticSummary(report, fixtureProof = {}) {
  if (!/^[a-f0-9]{40}$/.test(report.sourceSha ?? ''))
    throw new Error('Immutable diagnostic source SHA required');
  const machine = machineCoverage(
    report.requests ?? [],
    report.getInventoryTemplates ?? report.inventoryTemplates ?? [],
    report.machineCoverageRequired === true,
  );
  for (const item of machine.denials) {
    count(item.ordinaryAttempts);
    count(item.ordinaryCompletions);
    for (const probe of item.denials) {
      count(probe.attempts);
      if (
        probe.status !== null &&
        (!Number.isInteger(probe.status) ||
          probe.status < 0 ||
          probe.status > 599)
      )
        throw new Error('Unsafe machine status');
    }
  }
  count(machine.discoveredGets);
  if (machine.available && machine.failures.length) {
    report.hasFailed = true;
    report.failures ??= [];
    for (const label of machine.failures)
      if (!report.failures.includes(label)) report.failures.push(label);
  }
  const templates = new Set(report.inventoryTemplates ?? []);
  for (const template of templates)
    if (
      typeof template !== 'string' ||
      !/^\/v1(?:\/|$)/.test(template) ||
      /[?\n\r]/.test(template)
    )
      throw new Error('Unsafe diagnostic inventory template');
  const mail = report.mailStats ?? {
    version: 1,
    statusRequests: 0,
    accepted: { A: 0, B: 0, M: 0, M2: 0, S: 0 },
    rejected: {
      authorization: 0,
      path: 0,
      method: 0,
      contentType: 0,
      size: 0,
      json: 0,
      payload: 0,
    },
  };
  validateMailStats(mail);
  const mailAttributionAvailable = Array.isArray(mail.rejectedRequests);
  const phases = Object.fromEntries(
    DIAGNOSTIC_PHASES.map((name) => {
      const elapsed = report.phaseElapsed?.[name] ?? { startMs: 0, endMs: 0 };
      const coverage = {};
      for (const [actor, values] of Object.entries(
        report.inventory?.[name] ?? {},
      )) {
        if (!DIAGNOSTIC_ACTORS.includes(actor))
          throw new Error('Unsafe diagnostic actor');
        if (
          Object.keys(values).sort().join(',') !==
          'completed,discovered,enqueued,started'
        )
          throw new Error('Unsafe diagnostic coverage');
        for (const value of Object.values(values)) count(value);
        if (
          values.completed > values.started ||
          values.started > values.enqueued ||
          values.enqueued > values.discovered
        )
          throw new Error('Inconsistent diagnostic coverage');
        coverage[actor] = {
          ...values,
          unstarted: values.discovered - values.started,
        };
      }
      return [
        name,
        {
          startMs: count(elapsed.startMs),
          endMs: count(elapsed.endMs),
          durationMs: count(report.durations?.[name] ?? 0),
          coverage,
        },
      ];
    }),
  );
  for (const name of Object.keys(report.inventory ?? {}))
    if (!DIAGNOSTIC_PHASES.includes(name))
      throw new Error('Unsafe diagnostic phase');
  const aborts = Object.fromEntries(ABORT_SOURCES.map((value) => [value, 0]));
  const errors = {
    codes: Object.fromEntries(ERROR_CODES.map((value) => [value, 0])),
    names: Object.fromEntries(ERROR_NAMES.map((value) => [value, 0])),
  };
  const routes = new Map();
  const failedGroups = new Map();
  let unattributedFailureAttempts = 0;
  let failedAttempts = 0;
  const timingKeys = ['queueWaitMs', 'headerMs', 'bodyMs', 'totalMs'];
  const controlOrganizationQueryAttempts = {
    present: 0,
    absent: 0,
    unknown: 0,
  };
  for (const request of report.requests ?? []) {
    if (
      Object.hasOwn(request, 'organizationQueryPresent') &&
      typeof request.organizationQueryPresent !== 'boolean'
    )
      throw new Error('Unsafe diagnostic organization query presence');
    if (request.phase === 'controls') {
      const kind =
        request.organizationQueryPresent === true
          ? 'present'
          : request.organizationQueryPresent === false
            ? 'absent'
            : 'unknown';
      controlOrganizationQueryAttempts[kind]++;
    }
    if (request.status === 0) {
      if (
        !ABORT_SOURCES.includes(request.abortSource) ||
        !ERROR_CODES.includes(request.errorCode) ||
        !ERROR_NAMES.includes(request.errorName)
      )
        throw new Error('Unsafe diagnostic classification');
      failedAttempts = count(failedAttempts + 1);
      for (const key of timingKeys)
        if (Object.hasOwn(request, key)) count(request[key]);
      if (!templates.has(request.route)) {
        unattributedFailureAttempts = count(unattributedFailureAttempts + 1);
      } else {
        const phase = Object.hasOwn(request, 'sweepPhase')
          ? request.sweepPhase
          : request.phase;
        const tuple = {
          route: request.route,
          actor: DIAGNOSTIC_ACTORS.includes(request.actor)
            ? request.actor
            : 'unknown',
          phase: DIAGNOSTIC_PHASES.includes(phase) ? phase : 'unknown',
          method: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'HEAD',
            'OPTIONS',
          ].includes(request.method)
            ? request.method
            : 'other',
          abortSource: request.abortSource,
          errorName: request.errorName,
          errorCode: request.errorCode,
        };
        const key = JSON.stringify(Object.values(tuple));
        const group = failedGroups.get(key) ?? {
          ...tuple,
          attempts: 0,
          timedAttempts: 0,
          queueWaitMs: 0,
          headerMs: 0,
          bodyMs: 0,
          totalMs: 0,
          maximumMs: null,
        };
        group.attempts = count(group.attempts + 1);
        if (timingKeys.every((name) => Object.hasOwn(request, name))) {
          group.timedAttempts = count(group.timedAttempts + 1);
          for (const name of timingKeys)
            group[name] = count(group[name] + request[name]);
          group.maximumMs = Math.max(group.maximumMs ?? 0, request.totalMs);
        }
        failedGroups.set(key, group);
      }
      aborts[request.abortSource]++;
      errors.codes[request.errorCode]++;
      errors.names[request.errorName]++;
    }
    if (!templates.has(request.route)) continue;
    const values = routes.get(request.route) ?? {
      route: request.route,
      attempts: 0,
      queueWaitMs: 0,
      headerMs: 0,
      bodyMs: 0,
      totalMs: 0,
      maximumMs: 0,
    };
    values.attempts++;
    for (const key of ['queueWaitMs', 'headerMs', 'bodyMs', 'totalMs'])
      values[key] += count(request[key] ?? 0);
    values.maximumMs = Math.max(values.maximumMs, count(request.totalMs ?? 0));
    routes.set(request.route, values);
  }
  const failedRequestGroups = [...failedGroups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
  if (
    count(
      failedRequestGroups.reduce(
        (sum, group) => count(sum + group.attempts),
        unattributedFailureAttempts,
      ),
    ) !== failedAttempts
  )
    throw new Error('Inconsistent diagnostic failure attempts');
  return {
    schemaVersion: 1,
    machineCoverage: machine,
    setupEvidence: buildSetupEvidence(report),
    tenantEvidence: buildTenantEvidence(report, templates),
    failureEvidence: buildFailureEvidence(report),
    fixtureProofAvailable: fixtureProofState(fixtureProof).available,
    ...(report.cpuProfileEvidence === undefined
      ? {}
      : { cpuProfileEvidence: validateCpuEvidence(report.cpuProfileEvidence) }),
    ...(report.causalEvidence === undefined
      ? {}
      : {
          causalEvidence: validateCausalEvidence(report.causalEvidence, {
            templates: [...templates],
            actors: DIAGNOSTIC_ACTORS,
            phases: DIAGNOSTIC_PHASES,
          }),
        }),
    sourceSha: report.sourceSha,
    fixtureProof: fixtureProofState(fixtureProof).proof,
    mail: structuredClone(mail),
    mailAttributionAvailable,
    failedRequestGroups,
    unattributedFailureAttempts,
    phases,
    controlOrganizationQueryAttempts,
    aborts,
    errors,
    limiter: {
      maxActive: count(report.limiter?.maxActive ?? 0),
      maxQueued: count(report.limiter?.maxQueued ?? 0),
    },
    tenantHits: {
      strict: (report.requests ?? []).filter(
        (value) => value.hasTenantHit && value.actor !== 'S:A',
      ).length,
      override: (report.requests ?? []).filter(
        (value) => value.hasTenantHit && value.actor === 'S:A',
      ).length,
      finalLog: (report.apiLogHits ?? []).length,
    },
    slowRoutes: [...routes.values()]
      .sort((a, b) => b.maximumMs - a.maximumMs)
      .slice(0, 10),
  };
}
