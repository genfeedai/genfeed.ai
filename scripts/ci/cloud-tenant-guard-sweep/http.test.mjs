import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRequester,
  entity,
  requireSuccess,
  sessionCookie,
} from './http.mjs';

test('HTTP 200 tool hits and non-production error bodies are recorded without stopping the sweep', async () => {
  const records = [];
  const request = createRequester({
    baseUrl: 'http://127.0.0.1:3010',
    records,
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'http://127.0.0.1:3010');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.Authorization, 'Bearer ci-placeholder-jwt');
      assert.ok(options.signal);
      return new Response(
        JSON.stringify(
          url.pathname.endsWith('execute')
            ? {
                success: false,
                error:
                  'Tenant isolation: update on Brand is missing organizationId',
              }
            : { data: { id: 'cbrand12345' } },
        ),
      );
    },
  });
  const actor = { label: 'M:A', token: 'ci-placeholder-jwt' };
  const hit = await request(actor, 'POST', '/v1/agent-tools/tool/execute', {
    body: { parameters: {} },
    phase: 'tool',
  });
  assert.equal(hit.record.hasTenantHit, true);
  assert.throws(() => requireSuccess(hit, 'Fixture'), /Tenant isolation/);
  const success = await request(actor, 'GET', '/v1/brands');
  assert.equal(
    entity(requireSuccess(success, 'Brand'), 'Brand').id,
    'cbrand12345',
  );
  assert.equal(records.length, 2);
  assert.equal(JSON.stringify(records).includes(actor.token), false);
  await assert.rejects(
    request(actor, 'GET', 'https://example.invalid'),
    /Off-origin/,
  );
});

test('transport failure is recorded and only 429 is retried with one-second bounded delay', async () => {
  const records = [];
  let count = 0;
  const waits = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    wait: async (ms) => waits.push(ms),
    fetchImpl: async () => {
      if (count++ === 0)
        return new Response('{}', {
          status: 429,
          headers: { 'retry-after': '120' },
        });
      throw new Error('Request timed out');
    },
  });
  const result = await request({ label: 'S' }, 'GET', '/v1/brands');
  assert.equal(result.record.status, 0);
  assert.equal(result.record.isTimeout, false);
  assert.equal(records[0].isRetry, true);
  assert.equal(records.length, 2);
  assert.deepEqual(waits, [1_000]);
});

test('GET and tool deadlines are 5s and 10s, including body consumption', async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  const records = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    fetchImpl: async () => ({
      text: async () => {
        throw new DOMException('Body deadline', 'TimeoutError');
      },
    }),
  });
  await request({ label: 'M:A' }, 'GET', '/v1/brands');
  await request({ label: 'S' }, 'POST', '/v1/agent-tools/tool/execute', {
    phase: 'tool',
  });
  assert.deepEqual(deadlines, [5_000, 10_000]);
  assert.equal(records.length, 2);
  assert.ok(
    records.every(
      (record) =>
        record.status === 0 && record.isTimeout && !record.hasTenantHit,
    ),
  );
});

test('shared sweep deadline aborts an in-flight request and prevents further fetches', async () => {
  const controller = new AbortController();
  const records = [];
  let calls = 0;
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    sweepSignal: controller.signal,
    fetchImpl: async (_, { signal }) => {
      calls++;
      controller.abort(new DOMException('Sweep deadline', 'TimeoutError'));
      signal.throwIfAborted();
    },
  });
  const result = await request({ label: 'S' }, 'GET', '/v1/brands');
  assert.equal(result.record.isTimeout, true);
  await assert.rejects(
    request({ label: 'S' }, 'GET', '/v1/personas'),
    /Sweep deadline/,
  );
  assert.equal(calls, 1);
  assert.equal(records.length, 1);
});

test('extracts Better Auth session cookie and reads JSON:API resources', () => {
  assert.equal(
    sessionCookie(
      new Headers({
        'set-cookie':
          'better-auth.session_token=ci-placeholder-cookie; Path=/; HttpOnly',
      }),
    ),
    'better-auth.session_token=ci-placeholder-cookie',
  );
  assert.equal(
    sessionCookie(
      new Headers({
        'set-cookie':
          '__Secure-better-auth.session_token=ci-placeholder-cookie; Path=/; Secure',
      }),
    ),
    'better-auth.session_token=ci-placeholder-cookie',
  );
  assert.throws(() => sessionCookie(new Headers()), /no session cookie/);
  assert.equal(
    entity(
      { data: [{ id: 'cbrand12345', attributes: { label: 'Brand' } }] },
      'Brand',
    ).label,
    'Brand',
  );
  assert.throws(() => entity({ data: [] }, 'Brand'), /no entity id/);
});

test('fixture and warm-up use 60s per attempt while controls and tools retain short budgets', async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records: [],
    fetchImpl: async () => new Response('{}'),
  });
  await request(null, 'POST', '/v1/auth/sign-up/email', { phase: 'fixture' });
  await request(null, 'GET', '/v1/auth/token', { phase: 'fixture' });
  await request(null, 'GET', '/v1/openapi.json', { phase: 'warmup' });
  await request(null, 'GET', '/v1/organizations', { phase: 'controls' });
  await request(null, 'POST', '/v1/organizations', { phase: 'controls' });
  await request(null, 'POST', '/v1/agent-tools/tool/execute', {
    phase: 'tool',
  });
  assert.deepEqual(deadlines, [60000, 60000, 60000, 5000, 10000, 10000]);
});

test('fixture retries network, HTTP 0 and 502-504 failures exactly twice with backoff', async () => {
  for (const status of [0, 502, 503, 504]) {
    const records = [];
    const waits = [];
    let calls = 0;
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      records,
      phase: 'fixture',
      wait: async (ms) => waits.push(ms),
      fetchImpl: async () => {
        calls++;
        if (!status) throw new TypeError('fetch failed');
        return new Response('Upstream unavailable', { status });
      },
    });
    const result = await request(null, 'POST', '/v1/auth/sign-up/email');
    assert.equal(result.record.status, status);
    assert.equal(calls, 3);
    assert.deepEqual(waits, [1000, 2000]);
    assert.deepEqual(
      records.map((record) => Boolean(record.isRetry)),
      [true, true, false],
    );
    assert.ok(records.every((record) => record.durationMs >= 0));
  }
  const records = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    phase: 'fixture',
    wait: async () => {},
    fetchImpl: async () =>
      records.length === 0
        ? { status: 0, text: async () => '', headers: new Headers() }
        : new Response('{}'),
  });
  assert.equal(
    (await request(null, 'GET', '/v1/auth/token')).record.status,
    200,
  );
  assert.equal(records.length, 2);
});

test('setup never retries tenant-isolation markers or other HTTP failures', async () => {
  for (const [status, body] of [
    [502, 'Tenant isolation: update on Brand is missing organizationId'],
    [503, 'TenantIsolationError'],
    [400, 'Invalid input'],
    [401, 'Unauthorized'],
    [409, 'Duplicate user'],
    [429, 'Rate limited'],
    [500, 'Internal error'],
  ]) {
    const records = [];
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      records,
      phase: 'fixture',
      fetchImpl: async () => new Response(body, { status }),
      wait: async () => assert.fail('Must not retry'),
    });
    const result = await request(null, 'POST', '/v1/auth/sign-up/email');
    assert.equal(records.length, 1);
    assert.throws(() => requireSuccess(result, 'Sign up A'), /Sign up A: HTTP/);
  }
});

test('sweep does not retry transport or 502-504 failures', async () => {
  for (const status of [0, 502, 503, 504]) {
    const records = [];
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      records,
      fetchImpl: async () => {
        if (!status) throw new TypeError('fetch failed');
        return new Response('{}', { status });
      },
      wait: async () => assert.fail('Must not retry'),
    });
    await request(null, 'GET', '/v1/brands', { phase: 'get' });
    assert.equal(records.length, 1);
  }
});

test('exhausted fixture body timeouts retain timing and fail with request details', async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  let clock = 0;
  const records = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    phase: 'fixture',
    now: () => clock,
    wait: async () => {},
    fetchImpl: async () => ({
      text: async () => {
        clock += 60002;
        throw new DOMException('Body deadline', 'TimeoutError');
      },
    }),
  });
  const result = await request(null, 'POST', '/v1/auth/sign-up/email');
  assert.deepEqual(deadlines, [60000, 60000, 60000]);
  assert.equal(records.length, 3);
  assert.ok(records.every((record) => record.isTimeout));
  assert.throws(
    () => requireSuccess(result, 'Sign up A'),
    (error) => {
      assert.match(
        error.message,
        /POST \/v1\/auth\/sign-up\/email, 60002 ms, request timed out/,
      );
      assert.equal(error.record, result.record);
      return true;
    },
  );
});
