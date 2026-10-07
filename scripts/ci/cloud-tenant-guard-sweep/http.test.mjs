import assert from 'node:assert/strict';
import test from 'node:test';

import { createConcurrencyLimiter } from './core.mjs';
import {
  createRequester,
  entity,
  requireSuccess,
  sessionCookie,
} from './http.mjs';

test('global HTTP limiter spans actors, controls and tools through body consumption', async () => {
  const records = [];
  let active = 0;
  let peak = 0;
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    limit: createConcurrencyLimiter(10),
    fetchImpl: async () => {
      peak = Math.max(peak, ++active);
      return {
        status: 200,
        headers: new Headers(),
        text: async () => {
          await new Promise((resolve) => setImmediate(resolve));
          active--;
          return '{}';
        },
      };
    },
  });
  await Promise.all(
    ['M:A', 'M2:B', 'S', 'S:A'].flatMap((label) =>
      Array.from({ length: 25 }, (_, index) =>
        request({ label }, index % 2 ? 'GET' : 'POST', '/v1/example', {
          phase: index % 2 ? 'get' : 'tool',
          sweepPhase: label === 'S:A' ? 'superadminOverrideGets' : 'strict',
        }),
      ),
    ),
  );
  assert.equal(peak, 10);
  assert.equal(active, 0);
  assert.equal(records.length, 100);
  assert.equal(
    records.filter((record) => record.sweepPhase === 'superadminOverrideGets')
      .length,
    25,
  );
});

test('queued requests start their timeout only on admission and abort without fetching', async (context) => {
  let deadlines = 0;
  context.mock.method(AbortSignal, 'timeout', () => {
    deadlines++;
    return new AbortController().signal;
  });
  const controller = new AbortController();
  let release;
  const body = new Promise((resolve) => {
    release = resolve;
  });
  let fetches = 0;
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records: [],
    sweepSignal: controller.signal,
    limit: createConcurrencyLimiter(1),
    fetchImpl: async () => {
      fetches++;
      return { status: 200, text: () => body };
    },
  });
  const first = request(null, 'GET', '/v1/first');
  const second = request(null, 'GET', '/v1/queued');
  const settled = Promise.allSettled([first, second]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deadlines, 1);
  controller.abort(new Error('Budget exceeded'));
  release('{}');
  const results = await settled;
  assert.equal(results[1].status, 'rejected');
  assert.match(String(results[1].reason), /Budget exceeded/);
  assert.equal(fetches, 1);
  assert.equal(deadlines, 1);
});

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
  assert.throws(
    () => requireSuccess(hit, 'Fixture'),
    /Fixture: HTTP|Sign in A: HTTP/,
  );
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

test('GET and tool deadlines are 30s and 45s, including body consumption', async (t) => {
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
  assert.deepEqual(deadlines, [30_000, 45_000]);
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

test('fixture and warm-up use 60s per attempt while controls and tools use sweep budgets', async (t) => {
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
  assert.deepEqual(deadlines, [60000, 60000, 60000, 30000, 45000, 45000]);
});

test('sign-in retries transport and HTTP 500/502-504 exactly twice with retained attempts', async () => {
  for (const status of [0, 500, 502, 503, 504]) {
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
    const result = await request(null, 'POST', '/v1/auth/sign-in/email');
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
  assert.equal((await request(null, 'GET', '/v1/auth/token')).record.status, 0);
  assert.equal(records.length, 1);
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
  for (const status of [0, 500, 502, 503, 504]) {
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
  const result = await request(null, 'POST', '/v1/auth/sign-in/email');
  assert.deepEqual(deadlines, [60000, 60000, 60000]);
  assert.equal(records.length, 3);
  assert.ok(records.every((record) => record.isTimeout));
  assert.throws(
    () => requireSuccess(result, 'Sign up A'),
    (error) => {
      assert.match(error.message, /Sign up A: HTTP 0 \(60002 ms\)/);
      assert.equal(error.record, result.record);
      return true;
    },
  );
});

test('ambiguous signup is never replayed on transport failure or 5xx', async () => {
  for (const status of [0, 500, 502, 503, 504]) {
    const records = [];
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      phase: 'fixture',
      records,
      wait: async () => assert.fail('Signup must not replay'),
      fetchImpl: async () => {
        if (!status) throw new TypeError('Ambiguous transport failure');
        return new Response('{}', { status });
      },
    });
    await request(null, 'POST', '/v1/auth/sign-up/email');
    assert.equal(records.length, 1);
    assert.equal(records[0].isRetry, undefined);
  }
});

test('tenant-marked signin 500 fails immediately without a retry', async () => {
  const records = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    phase: 'fixture',
    records,
    wait: async () => assert.fail('Tenant marker must not retry'),
    fetchImpl: async () =>
      new Response('Tenant isolation: findFirst on User', { status: 500 }),
  });
  const result = await request(null, 'POST', '/v1/auth/sign-in/email');
  assert.equal(records.length, 1);
  assert.throws(
    () => requireSuccess(result, 'Sign in A'),
    /Fixture: HTTP|Sign in A: HTTP/,
  );
});

test('bounded signin recovery retains every attempt before success', async () => {
  const records = [];
  const waits = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    phase: 'fixture',
    records,
    wait: async (ms) => waits.push(ms),
    fetchImpl: async () =>
      new Response('{}', { status: records.length < 2 ? 500 : 200 }),
  });
  requireSuccess(
    await request(null, 'POST', '/v1/auth/sign-in/email'),
    'Sign in A',
  );
  assert.deepEqual(
    records.map((record) => [record.status, record.attempt]),
    [
      [500, 1],
      [500, 2],
      [200, 3],
    ],
  );
  assert.deepEqual(waits, [1000, 2000]);
});

test('mutating controls and tools are not replayed on throttling', async () => {
  for (const [path, phase] of [
    ['/v1/organizations', 'controls'],
    ['/v1/agent-tools/example/execute', 'tool'],
  ]) {
    const records = [];
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      records,
      wait: async () => assert.fail('Mutating request must not replay'),
      fetchImpl: async () => new Response('{}', { status: 429 }),
    });
    await request(null, 'POST', path, { phase });
    assert.equal(records.length, 1);
  }
});

test('request queue, headers and body timings remain independent', async () => {
  let clock = 0;
  const records = [];
  let granted;
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    now: () => clock,
    limit: async (run) => {
      clock += 12;
      granted = clock;
      return run();
    },
    fetchImpl: async () => {
      clock += 8;
      return {
        status: 200,
        headers: new Headers(),
        text: async () => {
          clock += 15;
          return '{}';
        },
      };
    },
  });
  await request(null, 'GET', '/v1/example');
  assert.equal(granted, 12);
  assert.equal(records[0].queueWaitMs, 12);
  assert.equal(records[0].headerMs, 8);
  assert.equal(records[0].bodyMs, 15);
  assert.equal(records[0].durationMs, 23);
  assert.equal(records[0].totalMs, 35);
});
test('blocked unverified signin never retries transport or server failure', async () => {
  for (const status of [0, 500, 502, 503, 504]) {
    let calls = 0;
    const request = createRequester({
      baseUrl: 'http://localhost:3010',
      records: [],
      phase: 'fixture',
      wait: async () => assert.fail('No retry wait'),
      fetchImpl: async () => {
        calls++;
        if (status === 0) throw new TypeError('private error');
        return new Response('{}', { status });
      },
    });
    await request(null, 'POST', '/v1/auth/sign-in/email', {
      allowSigninRetry: false,
    });
    assert.equal(calls, 1);
  }
});

test('parent deadline abort remains overall rather than request timeout', async () => {
  const { createDeadline } = await import('./core.mjs');
  const controller = new AbortController();
  const deadline = createDeadline(60_000, {
    parentSignal: controller.signal,
    parentAbortSources: [{ signal: controller.signal, source: 'overall' }],
    source: 'fixture/readiness',
  });
  const records = [];
  const request = createRequester({
    baseUrl: 'http://localhost:3010',
    records,
    deadline,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
        controller.abort(new DOMException('private reason', 'AbortError'));
      }),
  });
  await request(null, 'GET', '/v1/example', {
    phase: 'fixture',
    allowSigninRetry: false,
    signal: deadline.signal,
    abortSources: deadline.abortSources,
  });
  assert.equal(records[0].abortSource, 'overall');
});

for (const [query, present] of [
  ['', false],
  ['?other=private', false],
  ['?organizationId=private', true],
  ['?organizationId=', true],
  ['?organizationId=private&organizationId=another', true],
  ['?%6FrganizationId=private', true],
]) {
  for (const outcome of ['success', 'transport', 'retry']) {
    test(`records actual organization query presence ${JSON.stringify(query)} on ${outcome}`, async () => {
      const records = [];
      let calls = 0;
      const request = createRequester({
        baseUrl: 'http://localhost:3010',
        records,
        wait: async () => {},
        fetchImpl: async () => {
          calls++;
          if (outcome === 'transport')
            throw new TypeError('Synthetic transport failure');
          return {
            status: outcome === 'retry' && calls === 1 ? 429 : 200,
            headers: new Headers(),
            text: async () => '{}',
          };
        },
      });
      await request({ label: 'S' }, 'GET', `/v1/example${query}`, {
        organizationQueryPresent: !present,
      });
      assert.equal(records.length, outcome === 'retry' ? 2 : 1);
      assert.ok(
        records.every((record) => record.organizationQueryPresent === present),
      );
      assert.ok(
        records.every(
          (record) => !Object.hasOwn(record, 'organizationQueryValue'),
        ),
      );
      if (outcome === 'retry') assert.equal(records[0].isRetry, true);
    });
  }
}
