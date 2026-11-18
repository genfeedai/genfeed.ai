import assert from 'node:assert/strict';
import test from 'node:test';
import { smokeSignedIn } from './signed-in-smoke.mjs';

const APP = 'https://app.example.test';
const API = 'https://api.example.test';
const EMAIL = 'canary@example.test';
const PASSWORD = 'not-a-real-password';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...init.headers },
    status: init.status ?? 200,
  });
}

function redirect(location) {
  return new Response(null, { headers: { location }, status: 307 });
}

function server(overrides = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const { origin, pathname } = new URL(url);
    const method = init.method ?? 'GET';
    requests.push({ cookie: init.headers?.Cookie, method, origin, pathname });
    if (overrides[pathname]) return overrides[pathname](init);
    if (pathname === '/v1/auth/sign-in/email')
      return json(
        { user: { email: EMAIL } },
        {
          headers: {
            'set-cookie': '__Secure-session=abc; Path=/; HttpOnly; Secure',
          },
        },
      );
    if (pathname === '/v1/auth/get-session')
      return json({ user: { email: EMAIL, id: 'user_1' } });
    if (pathname === '/v1/auth/token') return json({ token: 'jwt' });
    if (pathname === '/v1/organizations')
      return init.headers.Authorization === 'Bearer jwt'
        ? json([{ id: 'org_1', slug: 'canary' }])
        : json({}, { status: 401 });
    if (pathname === '/') return redirect('/canary/default/workspace/overview');
    return new Response('<html></html>', { status: 200 });
  };
  return { fetchImpl, requests };
}

const run = (fetchImpl) =>
  smokeSignedIn({
    apiUrl: API,
    appUrl: APP,
    email: EMAIL,
    fetchImpl,
    password: PASSWORD,
  });

test('passes the whole journey for a healthy deploy', async () => {
  const { fetchImpl } = server();
  assert.deepEqual(await run(fetchImpl), [
    'sign-in',
    'session',
    'token',
    'app-shell',
    'organizations',
  ]);
});

test('sends GET requests only, plus the one sign-in call', async () => {
  const { fetchImpl, requests } = server();
  await run(fetchImpl);

  const writes = requests.filter(({ method }) => method !== 'GET');
  assert.deepEqual(writes, [
    {
      cookie: undefined,
      method: 'POST',
      origin: APP,
      pathname: '/v1/auth/sign-in/email',
    },
  ]);
  assert.ok(requests.length > 1);
});

test('sends the session cookie only to the app', async () => {
  const { fetchImpl, requests } = server();
  await run(fetchImpl);

  const appRequests = requests.slice(1).filter(({ origin }) => origin === APP);
  assert.equal(appRequests.length, 4);
  assert.ok(
    appRequests.every(({ cookie }) => cookie === '__Secure-session=abc'),
  );
  assert.deepEqual(requests.at(-1), {
    cookie: undefined,
    method: 'GET',
    origin: API,
    pathname: '/v1/organizations',
  });
});

test('stops the app journey at an off-origin redirect', async () => {
  const { fetchImpl, requests } = server({
    '/': () => redirect('https://elsewhere.example.test/'),
  });
  await assert.rejects(run(fetchImpl), {
    message: 'app shell redirected outside the app origin',
    step: 'app-shell',
  });
  assert.deepEqual(
    requests.map(({ origin }) => origin),
    [APP, APP, APP, APP],
  );
});

test('fails at sign-in when the auth proxy answers with a session error', async () => {
  const { fetchImpl } = server({
    '/v1/auth/sign-in/email': () => json({ code: 'INTERNAL' }, { status: 500 }),
  });
  await assert.rejects(run(fetchImpl), {
    message: 'sign-in returned HTTP 500',
    step: 'sign-in',
  });
});

test('fails at session when get-session returns null', async () => {
  const { fetchImpl } = server({
    '/v1/auth/get-session': () => json(null),
  });
  await assert.rejects(run(fetchImpl), { step: 'session' });
});

test('fails at app-shell when the signed-in canary is sent back to login', async () => {
  const { fetchImpl } = server({ '/': () => redirect('/login') });
  await assert.rejects(run(fetchImpl), { step: 'app-shell' });
});

test('fails at organizations when the canary has no organization', async () => {
  const { fetchImpl } = server({ '/v1/organizations': () => json([]) });
  await assert.rejects(run(fetchImpl), { step: 'organizations' });
});

test('reports the steps that passed before the failure', async () => {
  const { fetchImpl } = server({
    '/v1/auth/token': () => json({}, { status: 500 }),
  });
  await assert.rejects(run(fetchImpl), {
    passed: ['sign-in', 'session'],
    step: 'token',
  });
});
