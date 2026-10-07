import assert from 'node:assert/strict';
import { once } from 'node:events';
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
import {
  createLocalMailStub,
  readMailStats,
  zeroMailStats,
} from './local-mail-stub.mjs';

const key = 'ci-placeholder-internal-service-api-key';
const payload = {
  to: 'ci-cloud-a@example.invalid',
  subject: 'Verify your Genfeed.ai email',
  html: '<p>synthetic-secret-link</p>',
  idempotencyKey: 'auth/verification/opaque-key',
};

async function setup(context) {
  const runDir = mkdtempSync(join(tmpdir(), 'tenant-mail-'));
  context.after(() => rmSync(runDir, { recursive: true, force: true }));
  const stub = createLocalMailStub({ mode: 'local', key, runDir });
  const server = stub.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (body, options = {}) =>
    fetch(`${origin}${options.path ?? '/v1/internal/email-deliveries'}`, {
      method: options.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...options.headers,
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  return { stub, request };
}

test('local adapter implements authenticated status and stable synthetic delivery acceptance', async (context) => {
  assert.throws(() => createLocalMailStub({ mode: 'other', key }));
  assert.throws(() => createLocalMailStub({ mode: 'local', key: 'other-key' }));
  const { stub, request } = await setup(context);
  assert.deepEqual(await (await request(undefined, { method: 'GET' })).json(), {
    isConfigured: true,
  });
  const first = await (await request(payload)).json();
  assert.match(first.emailId, /^ci-local-mail-[a-f0-9]{24}$/);
  assert.deepEqual(await (await request(payload)).json(), first);
  for (const label of ['b', 'm', 'm2', 's'])
    assert.equal(
      (
        await request({
          ...payload,
          to: `ci-cloud-${label}@example.invalid`,
          idempotencyKey: `auth/verification/${label}`,
        })
      ).status,
      200,
    );
  assert.deepEqual(stub.counts, {
    ...zeroMailStats(),
    statusRequests: 1,
    accepted: { A: 2, B: 1, M: 1, M2: 1, S: 1 },
  });
  assert.equal(
    JSON.stringify(stub.counts).includes('synthetic-secret-link'),
    false,
  );
});

test('local adapter rejects wrong bearer, paths, methods, purposes, recipients and invalid bodies', async (context) => {
  const { request } = await setup(context);
  for (const method of ['GET', 'POST'])
    assert.equal(
      (
        await request(method === 'POST' ? payload : undefined, {
          method,
          headers: { authorization: 'Bearer wrong' },
        })
      ).status,
      401,
    );
  assert.equal((await request(payload, { path: '/other' })).status, 404);
  assert.equal((await request(undefined, { method: 'DELETE' })).status, 405);
  assert.equal(
    (await request(payload, { headers: { 'content-type': 'text/plain' } }))
      .status,
    415,
  );
  for (const body of [
    'bad json',
    null,
    {},
    { ...payload, to: 'real@example.com' },
    { ...payload, to: ['ci-cloud-a@example.invalid'] },
    { ...payload, subject: 'Password reset' },
    { ...payload, html: '' },
    { ...payload, idempotencyKey: 'auth/password-reset/x' },
    { ...payload, idempotencyKey: 'auth/verification/' },
  ])
    assert.equal((await request(body)).status, 400);
  assert.equal(
    (await request({ ...payload, html: 'x'.repeat(256 * 1024) })).status,
    413,
  );
});

test('local adapter makes no outbound calls and logs no content or credentials', async (context) => {
  const runDir = mkdtempSync(join(tmpdir(), 'tenant-mail-'));
  context.after(() => rmSync(runDir, { recursive: true, force: true }));
  const { handler, counts } = createLocalMailStub({
    mode: 'local',
    key,
    runDir,
  });
  context.mock.method(globalThis, 'fetch', () =>
    assert.fail('Adapter must never forward'),
  );
  for (const method of ['log', 'error', 'warn'])
    context.mock.method(console, method, () =>
      assert.fail('Adapter must not log request content'),
    );
  const request = {
    method: 'POST',
    url: '/v1/internal/email-deliveries',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(payload));
    },
  };
  let status;
  let body;
  await handler(request, {
    writeHead(value) {
      status = value;
    },
    end(value) {
      body = JSON.parse(value);
    },
  });
  assert.equal(status, 200);
  assert.match(body.emailId, /^ci-local-mail-/);
  assert.deepEqual(counts, {
    ...zeroMailStats(),
    accepted: { A: 1, B: 0, M: 0, M2: 0, S: 0 },
  });
});

test('owned statistics require exact schema, secure modes and no preexisting file', (context) => {
  const runDir = mkdtempSync(join(tmpdir(), 'tenant-mail-files-'));
  context.after(() => rmSync(runDir, { recursive: true, force: true }));
  assert.throws(() => readMailStats(runDir));
  createLocalMailStub({ mode: 'ci', key, runDir });
  const initial = readMailStats(runDir);
  assert.deepEqual(initial, zeroMailStats());
  assert.throws(() => createLocalMailStub({ mode: 'ci', key, runDir }));
  chmodSync(join(runDir, 'mail-stats.json'), 0o644);
  assert.throws(() => readMailStats(runDir));
  chmodSync(join(runDir, 'mail-stats.json'), 0o600);
  writeFileSync(
    join(runDir, 'mail-stats.json'),
    JSON.stringify({ ...initial, secret: 'refused' }),
  );
  assert.throws(() => readMailStats(runDir));
  rmSync(join(runDir, 'mail-stats.json'));
  symlinkSync('/missing', join(runDir, 'mail-stats.json'));
  assert.throws(() => readMailStats(runDir));
  assert.throws(() => createLocalMailStub({ mode: 'ci', key, runDir }));
  rmSync(join(runDir, 'mail-stats.json'));
  chmodSync(runDir, 0o755);
  assert.throws(() => createLocalMailStub({ mode: 'ci', key, runDir }));
});
test('concurrent accepted snapshots are serialized and monotonic', async (context) => {
  const { stub, request } = await setup(context);
  await Promise.all(Array.from({ length: 20 }, () => request(payload)));
  assert.equal(stub.counts.accepted.A, 20);
});
test('statistics persistence failure fails the response and signals shutdown', async (context) => {
  const runDir = mkdtempSync(join(tmpdir(), 'tenant-mail-write-'));
  context.after(() => rmSync(runDir, { recursive: true, force: true }));
  let writes = 0,
    fatal = 0;
  const stub = createLocalMailStub({
    mode: 'ci',
    key,
    runDir,
    writeSnapshot: () => {
      if (++writes > 1) throw new Error('disk failure');
    },
    onFatal: () => fatal++,
  });
  let status;
  await stub.handler(
    {
      headers: { authorization: `Bearer ${key}` },
      method: 'GET',
      url: '/v1/internal/email-deliveries',
    },
    { writeHead: (value) => (status = value), end: () => {} },
  );
  assert.equal(status, 500);
  assert.equal(fatal, 1);
});

test('refusal attribution records only exact fixed tuples and preserves authorization-first ordering', async (context) => {
  const runDir = mkdtempSync(join(tmpdir(), 'tenant-mail-attribution-'));
  context.after(() => rmSync(runDir, { recursive: true, force: true }));
  const { handler, counts } = createLocalMailStub({ mode: 'ci', key, runDir });
  const cases = [
    ['/v1/health', undefined, 'health', 'absent', 401],
    ['/v1/health', 'private-token', 'health', 'other', 401],
    ['/v1/health', `Bearer ${key}`, 'health', 'matched', 404],
    [
      '/v1/internal/system-notifications',
      `Bearer ${key}`,
      'systemNotifications',
      'matched',
      404,
    ],
    [
      '/v1/internal/channel-deliveries',
      `Bearer ${key}`,
      'channelDeliveries',
      'matched',
      404,
    ],
    [
      '/v1/internal/email-deliveries',
      undefined,
      'emailDeliveries',
      'absent',
      401,
    ],
    ['/v1/health?private-query', `Bearer ${key}`, 'other', 'matched', 404],
    ['/private-id/path', 'private-token', 'other', 'other', 401],
    ['/v1/%68ealth', `Bearer ${key}`, 'other', 'matched', 404],
  ];
  for (const [url, authorization, route, auth, expected] of cases) {
    let status;
    await handler(
      { method: 'GET', url, headers: { authorization } },
      {
        writeHead: (value) => {
          status = value;
        },
        end() {},
      },
    );
    assert.equal(status, expected);
    assert.ok(
      counts.rejectedRequests.some(
        (entry) =>
          entry.route === route &&
          entry.authorization === auth &&
          entry.reason === (expected === 401 ? 'authorization' : 'path'),
      ),
    );
  }
  const serialized = JSON.stringify(counts);
  for (const sentinel of ['private-token', 'private-query', 'private-id', key])
    assert.equal(serialized.includes(sentinel), false);
  const { validateMailStats } = await import('./local-mail-stub.mjs');
  validateMailStats(counts);
});

test('concurrent refusals group atomically and all original refusal reasons reconcile', async (context) => {
  const { stub, request } = await setup(context);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      request(undefined, {
        method: 'GET',
        headers: { authorization: 'private-token' },
      }),
    ),
  );
  assert.equal(stub.counts.rejectedRequests[0].count, 20);
  await request(payload, { path: '/private' });
  await request(undefined, { method: 'DELETE' });
  await request(payload, { headers: { 'content-type': 'text/plain' } });
  await request('invalid');
  await request({});
  await request({ ...payload, html: 'x'.repeat(256 * 1024) });
  const { validateMailStats, MAIL_REASONS } = await import(
    './local-mail-stub.mjs'
  );
  validateMailStats(stub.counts);
  for (const reason of MAIL_REASONS)
    assert.ok(stub.counts.rejected[reason] > 0);
  const keys = stub.counts.rejectedRequests.map(
    ({ method, route, authorization, reason }) =>
      [method, route, authorization, reason].join('|'),
  );
  assert.deepEqual(keys, [...keys].sort());
});

test('mail attribution validates compatibility, exact enums, sums, uniqueness and monotonic snapshots', async () => {
  const { validateMailStats } = await import('./local-mail-stub.mjs');
  const historical = zeroMailStats();
  delete historical.rejectedRequests;
  assert.equal(validateMailStats(historical), historical);
  const stats = zeroMailStats();
  stats.rejected.path = 2;
  stats.rejectedRequests = [
    {
      method: 'GET',
      route: 'health',
      authorization: 'matched',
      reason: 'path',
      count: 2,
    },
  ];
  validateMailStats(stats, historical);
  for (const mutate of [
    (s) => {
      s.extra = 'private';
    },
    (s) => {
      s.rejectedRequests = null;
    },
    (s) => {
      s.rejectedRequests[0].extra = 'private';
    },
    ...['method', 'route', 'authorization', 'reason'].map((key) => (s) => {
      s.rejectedRequests[0][key] = 'private';
    }),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((count) => (s) => {
      s.rejectedRequests[0].count = count;
    }),
    (s) => {
      s.rejectedRequests.push({ ...s.rejectedRequests[0] });
    },
    (s) => {
      s.rejectedRequests = [];
    },
    (s) => {
      s.rejectedRequests = Array.from({ length: 316 }, () => ({
        ...s.rejectedRequests[0],
      }));
    },
  ]) {
    const invalid = structuredClone(stats);
    mutate(invalid);
    assert.throws(() => validateMailStats(invalid));
  }
  assert.throws(() => validateMailStats(historical, zeroMailStats()));
  const smaller = structuredClone(stats);
  smaller.rejected.path = 1;
  smaller.rejectedRequests[0].count = 1;
  assert.throws(() => validateMailStats(smaller, stats));
  const shifted = structuredClone(stats);
  shifted.rejectedRequests[0].route = 'other';
  assert.throws(() => validateMailStats(shifted, stats));
});
