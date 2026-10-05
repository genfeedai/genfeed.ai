import { randomUUID } from 'node:crypto';

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
  const drain = () => {
    while (active < concurrency && queue.length) {
      const { run, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(run)
        .then(resolve, reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  };
  return (run) =>
    new Promise((resolve, reject) => {
      queue.push({ run, resolve, reject });
      drain();
    });
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
  const count = attempted.filter((result) => result.isTimeout).length;
  return {
    count,
    requests: attempted.length,
    ratio: attempted.length ? count / attempted.length : 0,
    hasExceededLimit: count > attempted.length * 0.05,
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
) {
  const errors = [];
  if (routeCount < 100)
    errors.push(`Only ${routeCount} GET routes discovered (minimum 100)`);
  if (toolCount < 20)
    errors.push(`Only ${toolCount} distinct tools discovered (minimum 20)`);
  const timeouts = timeoutStats(requests);
  if (timeouts.hasExceededLimit)
    errors.push(
      `${timeouts.count}/${timeouts.requests} requests timed out (${(timeouts.ratio * 100).toFixed(2)}%; maximum 5%)`,
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
        result.status !== 429,
    );
    if (attempted.length !== routeCount)
      errors.push(
        `${actor}: only ${attempted.length}/${routeCount} GET routes attempted`,
      );
    // Timeouts remain unknown evidence, governed by the ratio gate above.
    // They must not independently fail a minimum-sized route inventory.
    const timedOut = attempted.filter((result) => result.isTimeout).length;
    const requiredCompleted = Math.min(100, routeCount - timedOut);
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
    if (attempted.length !== expected)
      errors.push(
        `${actor}: ${attempted.length}/${expected} tool requests attempted`,
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
