import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeadline } from './core.mjs';

import {
  fixtureDatabase,
  printFixtureFailure,
  seedFixture as realSeedFixture,
  sweepOrganizationAndGrants,
  warmup,
} from './fixture.mjs';

import { zeroMailStats } from './local-mail-stub.mjs';

// Existing workflow mocks retain their successful auth behavior while explicitly
// modeling the additional verification-mail and unauthenticated denial boundary.
async function seedFixture(request, prisma, options = {}) {
  const stats = zeroMailStats();
  return realSeedFixture(
    async (actor, method, path, settings) => {
      if (
        path.endsWith('sign-in/email') &&
        settings.allowSigninRetry === false
      ) {
        const label = settings.body.email
          .match(/ci-cloud-(.+)@/)[1]
          .toUpperCase();
        stats.accepted[label]++;
        return {
          record: { status: 403, hasTenantHit: false },
          json: { token: null },
          headers: new Headers(),
        };
      }
      const response = await request(actor, method, path, settings);
      if (path.endsWith('sign-up/email')) {
        const label = settings.body.email
          .match(/ci-cloud-(.+)@/)[1]
          .toUpperCase();
        stats.accepted[label]++;
        response.json.token ??= null;
      }
      return response;
    },
    prisma,
    { readMailStats: () => structuredClone(stats), ...options },
  );
}

for (const [name, signIn, error] of [
  ['rejected sign-in', { status: 403 }, /Sign in A: HTTP 403/],
  [
    'wrong identity',
    { status: 200, userId: 'other-user' },
    /canonical user id mismatch/,
  ],
  [
    'missing session cookie',
    { status: 200, userId: 'user-A' },
    /no session cookie/,
  ],
]) {
  test(`fixture stops before JWT resolution on ${name}`, async () => {
    const calls = [];
    const request = async (_actor, _method, path, options) => {
      calls.push(path);
      const isSignup = path.endsWith('sign-up/email');
      const label = options.body.email.match(/ci-cloud-(.+)@/)[1].toUpperCase();
      return {
        record: { status: isSignup ? 200 : signIn.status, hasTenantHit: false },
        json: {
          user: {
            id: isSignup ? `user-${label}` : signIn.userId,
            emailVerified: false,
          },
        },
        headers: new Headers(),
        body: 'Sign-in failed',
      };
    };
    const updates = [];
    await assert.rejects(
      seedFixture(request, {
        user: { update: async (data) => updates.push(data) },
      }),
      error,
    );
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], {
      where: { id: 'user-A' },
      data: { emailVerified: true },
    });
    assert.equal(
      calls.filter((path) => path.endsWith('sign-in/email')).length,
      1,
    );
    assert.ok(!calls.includes('/v1/auth/token'));
  });
}

test('HTTP fixture verifies before sign-in without a sign-up session, elevates before S auth, and verifies grants', async () => {
  const events = [];
  const members = [];
  let activeSignups = 0;
  let peakSignups = 0;
  let activeAuth = 0;
  let peakAuth = 0;
  const prisma = {
    user: {
      update: async (value) => {
        events.push({ type: 'user-update', ...value });
      },
    },
    member: {
      create: async ({ data }) => {
        members.push(data);
        events.push({ type: 'member-create', data });
        return { id: `cmember${members.length}123` };
      },
    },
  };
  const request = async (actor, method, path, options = {}) => {
    events.push({ actor: actor?.label, method, path, ...options });
    let json = { data: { id: 'cdefault12345' } };
    let headers = new Headers();
    if (path.endsWith('sign-up/email')) {
      peakSignups = Math.max(peakSignups, ++activeSignups);
      await new Promise((resolve) => setImmediate(resolve));
      activeSignups--;
      const label = options.body.name.split(' ').at(-1);
      json = {
        token: null,
        user: { id: `user-${label}`, emailVerified: false },
      };
    } else if (path.endsWith('sign-in/email')) {
      peakAuth = Math.max(peakAuth, ++activeAuth);
      await new Promise((resolve) => setImmediate(resolve));
      activeAuth--;
      const label = options.body.email.match(/ci-cloud-(.+)@/)[1].toUpperCase();
      assert.ok(
        events.some(
          (event) =>
            event.type === 'user-update' &&
            event.where.id === `user-${label}` &&
            event.data.emailVerified === true,
        ),
      );
      if (label === 'S')
        assert.ok(
          events.some(
            (event) =>
              event.type === 'user-update' &&
              event.where.id === 'user-S' &&
              event.data.platformRole === 'SUPERADMIN',
          ),
        );
      json = { user: { id: `user-${label}`, emailVerified: true } };
      headers = new Headers({
        'set-cookie': `better-auth.session_token=ci-placeholder-${label}; Path=/`,
      });
    } else if (path.endsWith('/auth/token')) {
      assert.ok(
        events.some(
          (event) =>
            event.path === '/v1/auth/sign-in/email' &&
            options.headers.cookie.includes(
              `ci-placeholder-${event.body.email.match(/ci-cloud-(.+)@/)[1].toUpperCase()}`,
            ),
        ),
      );
      json = { token: `ci-placeholder-jwt-${options.headers.cookie.at(-1)}` };
    } else if (path === '/v1/organizations?mine=true') {
      json = [
        {
          id: `corg${actor.label}12345`,
          slug: `ci-${actor.label.toLowerCase()}`,
        },
      ];
    } else if (path.startsWith('/v1/brands?')) {
      json = {
        data: [
          {
            id: `cbrand${actor.label}12345`,
            attributes: { label: `Brand ${actor.label}` },
          },
        ],
      };
    } else if (path === '/v1/roles') {
      json = { data: [{ id: 'cadmin12345', attributes: { key: 'admin' } }] };
    } else if (path === '/v1/personas' && method === 'POST') {
      json = { data: { id: `cpersona${actor.label}12345` } };
    } else if (path.endsWith('/grants') && method === 'POST') {
      assert.equal(actor.label, 'M');
      assert.equal(members.length, 4);
      assert.equal(options.body.recipientOrganizationId, 'corgB12345');
      json = { data: { id: 'cgrant12345' } };
    } else if (path.startsWith('/v1/personas?brandId=')) {
      json = { data: [{ id: 'cpersonaA12345' }] };
    }
    return {
      json,
      headers,
      body: JSON.stringify(json),
      record: { status: 200, hasTenantHit: false },
    };
  };
  const fixture = await seedFixture(request, prisma);
  assert.equal(peakSignups, 1);
  assert.equal(peakAuth, 1);
  for (const label of ['A', 'B', 'M', 'M2']) {
    const ready = events.findIndex(
      (event) => event.actor === label && event.path?.startsWith('/v1/brands?'),
    );
    const next = events.findIndex(
      (event) =>
        event.path === '/v1/auth/sign-up/email' &&
        event.body.name.split(' ').at(-1) ===
          ['A', 'B', 'M', 'M2', 'S'][['A', 'B', 'M', 'M2'].indexOf(label) + 1],
    );
    assert.ok(ready >= 0 && ready < next);
  }
  assert.deepEqual(
    events
      .filter((event) => event.path === '/v1/auth/sign-up/email')
      .map((event) => event.body.name.split(' ').at(-1)),
    ['A', 'B', 'M', 'M2', 'S'],
  );
  assert.ok(
    events
      .filter((event) => event.method)
      .every((event) => event.phase === 'fixture'),
  );
  assert.equal(fixture.orgA.personaId, 'cpersonaA12345');
  assert.equal(fixture.orgB.personaId, fixture.orgA.personaId);
  assert.equal(fixture.orgS.brandId, 'cbrandS12345');
  assert.equal(fixture.orgS.personaId, 'cpersonaS12345');
  assert.notEqual(fixture.member.userId, fixture.member2.userId);
  assert.equal(members.length, 4);
  assert.equal(
    events.filter(
      (event) =>
        event.type === 'user-update' && event.data.emailVerified === true,
    ).length,
    5,
  );
  assert.ok(
    events.every((event) => event.body?.isEmailVerificationRequired !== false),
  );
  assert.deepEqual(
    members
      .filter((row) => row.userId === fixture.member2.userId)
      .map((row) => row.organizationId),
    ['corgA12345', 'corgB12345'],
  );
  for (const [actor, organization] of [
    [fixture.member, fixture.orgA],
    [fixture.member2, fixture.orgB],
  ])
    assert.ok(
      events.some(
        (event) =>
          event.type === 'user-update' &&
          event.where.id === actor.userId &&
          event.data.lastUsedOrganizationId === organization.organizationId,
      ),
    );
  const elevation = events.findIndex(
    (event) =>
      event.type === 'user-update' && event.data.platformRole === 'SUPERADMIN',
  );
  const firstSRequest = events.findIndex((event) => event.actor === 'S');
  assert.ok(elevation >= 0 && elevation < firstSRequest);
  const firstMRequest = events.findIndex(
    (event) =>
      event.actor === 'M' &&
      event.method === 'POST' &&
      event.path.endsWith('/grants'),
  );
  assert.ok(
    events.filter(
      (event, index) => index < firstMRequest && event.type === 'member-create',
    ).length === 4,
  );
  assert.deepEqual(
    members
      .filter((row) => row.userId === fixture.member.userId)
      .map(
        ({ organizationId, roleKey, currentBrandId, isActive, isDeleted }) => ({
          organizationId,
          roleKey,
          currentBrandId,
          isActive,
          isDeleted,
        }),
      ),
    [
      {
        organizationId: 'corgA12345',
        roleKey: 'admin',
        currentBrandId: 'cbrandA12345',
        isActive: true,
        isDeleted: false,
      },
      {
        organizationId: 'corgB12345',
        roleKey: 'admin',
        currentBrandId: 'cbrandB12345',
        isActive: true,
        isDeleted: false,
      },
    ],
  );
});

test('control sweep retains later requests after a thrown-mode response hit', async () => {
  const calls = [];
  const request = async (actor, method, path) => {
    calls.push({ actor: actor.label, method, path });
    return {
      record: {
        status: path.includes('activate') ? 200 : 500,
        hasTenantHit: !path.includes('activate'),
      },
      json: {},
      body: 'Tenant isolation: findMany on Brand is missing organizationId',
    };
  };
  await sweepOrganizationAndGrants(request, {
    member: { label: 'M' },
    superadmin: { label: 'S' },
    userA: { label: 'A' },
    userB: { label: 'B' },
    orgA: { organizationId: 'corgA12345' },
    orgB: { organizationId: 'corgB12345', brandId: 'cbrandB12345' },
    personaId: 'cpersonaA12345',
    grantId: 'cgrant12345',
  });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 2);
  assert.equal(
    calls.filter((call) => call.path.endsWith('activate')).length,
    3,
  );
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.equal(
    calls.at(-1).path,
    '/v1/personas/cpersonaA12345/grants/cgrant12345',
  );
});

test('warm-up requests health then the lazy OpenAPI document once', async () => {
  const calls = [];
  const document = { paths: {} };
  const result = await warmup(async (_actor, method, path, options) => {
    calls.push({ method, path, phase: options.phase });
    return { record: { status: 200 }, json: document };
  });
  assert.equal(result, document);
  assert.deepEqual(calls, [
    { method: 'GET', path: '/v1/health', phase: 'warmup' },
    { method: 'GET', path: '/v1/openapi.json', phase: 'warmup' },
  ]);
});

test('DB setup retries connection failures twice with backoff', async () => {
  let calls = 0;
  const waits = [];
  const result = await fixtureDatabase(
    'Verify A',
    async () => {
      if (++calls < 3)
        throw Object.assign(new Error('Connection closed'), { code: 'P1017' });
      return 'verified';
    },
    { wait: async (ms) => waits.push(ms) },
  );
  assert.equal(result, 'verified');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('DB setup never retries tenant markers, constraints or transaction timeouts', async () => {
  for (const [code, message] of [
    ['P1017', 'Tenant isolation: update on User'],
    ['P2002', 'Unique constraint'],
    ['P2028', 'Transaction timeout'],
  ]) {
    let calls = 0;
    await assert.rejects(
      fixtureDatabase('Verify A', async () => {
        calls++;
        throw Object.assign(new Error(message), { code });
      }),
      /Fixture database operation failed/,
    );
    assert.equal(calls, 1);
  }
});

test('DB setup deadline fails clearly without replaying an in-flight write', async () => {
  let calls = 0;
  await assert.rejects(
    fixtureDatabase(
      'Verify A',
      () => {
        calls++;
        return new Promise(() => {});
      },
      { timeoutMs: 1 },
    ),
    (error) => {
      assert.match(error.message, /Fixture database operation failed/);
      assert.equal(error.record.method, 'DB');
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('fixture failure never prints authentication bodies or private API logs', () => {
  let output = '';
  printFixtureFailure(
    Object.assign(new Error('private-token'), {
      record: { status: 0, durationMs: 3, path: '/private-query' },
    }),
    [],
    '/private-path',
    (value) => (output += value),
  );
  assert.match(output, /status=0 duration=3ms/);
  assert.doesNotMatch(output, /private/);
});

test('DB setup default deadline is 60s per attempt and timers are cleared', async (t) => {
  const deadlines = [];
  const pending = new Set();
  t.mock.method(globalThis, 'setTimeout', (_callback, ms) => {
    deadlines.push(ms);
    const timer = {};
    pending.add(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => pending.delete(timer));
  assert.equal(await fixtureDatabase('Verify A', async () => 'ok'), 'ok');
  assert.deepEqual(deadlines, [60000]);
  assert.equal(pending.size, 0);
});

test('workspace readiness polls empty success and expires before the next signup', async () => {
  let clock = 0;
  const calls = [];
  const request = async (_actor, _method, path) => {
    calls.push(path);
    let json = { token: null, user: { id: 'user-A', emailVerified: false } };
    if (path === '/v1/auth/token') json = { token: 'genuine-test-token' };
    if (path === '/v1/organizations?mine=true') json = { data: [] };
    return {
      record: { status: 200, hasTenantHit: false, path, phase: 'fixture' },
      json,
      headers: path.endsWith('sign-up/email')
        ? new Headers()
        : new Headers({
            'set-cookie': 'better-auth.session_token=test; Path=/',
          }),
      body: JSON.stringify(json),
    };
  };
  await assert.rejects(
    seedFixture(
      request,
      { user: { update: async () => {} } },
      {
        now: () => clock,
        deadline: createDeadline(240_000, { now: () => clock }),
        wait: async (ms) => {
          clock += ms;
        },
      },
    ),
    /deadline exceeded/,
  );
  assert.equal(clock, 20_000);
  assert.equal(
    calls.filter((path) => path.endsWith('sign-up/email')).length,
    1,
  );
  assert.equal(
    calls.filter((path) => path === '/v1/organizations?mine=true').length,
    10,
  );
});

test('overall fixture deadline fails immediately before provisioning another actor', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Overall deadline exhausted'));
  await assert.rejects(
    seedFixture(
      async () => assert.fail('No provisioning after deadline'),
      {},
      {
        deadline: createDeadline(240_000, { parentSignal: controller.signal }),
      },
    ),
    /Overall deadline exhausted/,
  );
});

test('signup must remain unverified until explicit fixture-only verification', async () => {
  await assert.rejects(
    seedFixture(
      async () => ({
        record: { status: 200, hasTenantHit: false },
        json: { user: { id: 'canonical-user', emailVerified: true } },
      }),
      {
        user: {
          update: async () =>
            assert.fail('Must not accept pre-verified signup'),
        },
      },
    ),
    /remain unverified/,
  );
});

for (const mode of [
  'token',
  'cookie',
  'mailMissing',
  'mailOther',
  'mailRejected',
  'denialStatus',
  'denialCookie',
  'denialToken',
  'denialTenant',
]) {
  test(`unverified proof fails closed for ${mode}`, async () => {
    const stats = zeroMailStats();
    let updates = 0;
    let calls = 0;
    await assert.rejects(
      realSeedFixture(
        async (_actor, _method, path, options) => {
          calls++;
          if (path.endsWith('sign-up/email')) {
            if (mode !== 'mailMissing') stats.accepted.A++;
            if (mode === 'mailOther') stats.accepted.B++;
            if (mode === 'mailRejected') stats.rejected.payload++;
            return {
              record: { status: 200, hasTenantHit: false },
              json: {
                token: mode === 'token' ? 'secret' : null,
                user: { id: 'canonical', emailVerified: false },
              },
              headers:
                mode === 'cookie'
                  ? new Headers({
                      'set-cookie': 'better-auth.session_token=secret',
                    })
                  : new Headers(),
            };
          }
          assert.equal(options.allowSigninRetry, false);
          stats.accepted.A++;
          return {
            record: {
              status: mode === 'denialStatus' ? 500 : 403,
              hasTenantHit: mode === 'denialTenant',
            },
            json: { token: mode === 'denialToken' ? 'secret' : null },
            headers:
              mode === 'denialCookie'
                ? new Headers({
                    'set-cookie': 'better-auth.session_token=secret',
                  })
                : new Headers(),
          };
        },
        { user: { update: async () => updates++ } },
        { readMailStats: () => structuredClone(stats) },
      ),
    );
    assert.equal(updates, 0);
    assert.ok(calls <= 2);
  });
}
