import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  fixtureDatabase,
  printFixtureFailure,
  seedFixture,
  sweepOrganizationAndGrants,
  warmup,
} from './fixture.mjs';

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
        json: { user: { id: isSignup ? `user-${label}` : signIn.userId } },
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
    assert.equal(updates.length, 5);
    assert.deepEqual(updates[0], {
      where: { id: 'user-A' },
      data: { emailVerified: true },
    });
    assert.equal(
      calls.filter((path) => path.endsWith('sign-in/email')).length,
      5,
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
      while (
        events.filter((event) => event.path === '/v1/auth/sign-up/email')
          .length < 5
      )
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
  assert.ok(peakAuth > 1);
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
  const firstMRequest = events.findIndex((event) => event.actor === 'M');
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
      /Verify A/,
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
      assert.match(error.message, /Database setup timed out after 1 ms/);
      assert.equal(error.record.method, 'DB');
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('fixture failure prints the failing request and last 20 non-empty log lines', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloud-fixture-log-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const apiLog = join(directory, 'api.log');
  writeFileSync(
    apiLog,
    Array.from({ length: 25 }, (_, index) => `line ${index + 1}\n\n  \n`).join(
      '',
    ),
  );
  const error = Object.assign(new Error('Sign up A failed'), {
    record: {
      method: 'POST',
      path: '/v1/auth/sign-up/email',
      status: 0,
      durationMs: 60002,
    },
  });
  let output = '';
  printFixtureFailure(
    error,
    [{ method: 'GET', path: '/unrelated', phase: 'fixture' }],
    apiLog,
    (text) => {
      output += text;
    },
  );
  assert.match(
    output,
    /POST \/v1\/auth\/sign-up\/email status=0 duration=60002ms/,
  );
  assert.match(output, /line 6\n/);
  assert.match(output, /line 25\n/);
  assert.doesNotMatch(output, /line 5\n|\/unrelated/);
  assert.equal(
    output.split('\n').filter((line) => line.startsWith('line ')).length,
    20,
  );
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
