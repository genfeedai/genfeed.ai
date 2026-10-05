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
