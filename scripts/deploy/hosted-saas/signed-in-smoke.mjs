import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Signed-in post-deploy journey. It signs in as a dedicated canary account and
// reads: the session, the app shell and one organization-scoped list. The only
// non-GET request is the sign-in call itself, enforced in `send` below and
// asserted by signed-in-smoke.test.mjs.

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 6;
const SIGN_IN_PATH = '/v1/auth/sign-in/email';
const UNSIGNED_PATH_PREFIXES = ['/login', '/sign-up', '/onboarding'];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function boundedFetch(url, init) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function createCookieJar() {
  const cookies = new Map();
  return {
    header: () =>
      [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    store(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair, ...attributes] = line.split(';');
        const separator = pair.indexOf('=');
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        const isExpired = attributes.some(
          (attribute) => attribute.trim().toLowerCase() === 'max-age=0',
        );
        if (isExpired || value === '') cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    isEmpty: () => cookies.size === 0,
  };
}

/**
 * Runs the journey once and returns the labels of the steps that passed.
 * A failure throws an Error whose `step` names the step that failed.
 */
export async function smokeSignedIn({
  appUrl,
  apiUrl,
  email,
  password,
  fetchImpl = boundedFetch,
}) {
  const passed = [];
  const jar = createCookieJar();

  async function send(url, { method = 'GET', body, headers = {} } = {}) {
    const { pathname } = new URL(url);
    const isSignIn = method === 'POST' && pathname === SIGN_IN_PATH;
    expect(
      method === 'GET' || isSignIn,
      `signed-in smoke is read-only; refusing ${method} ${pathname}`,
    );
    const response = await fetchImpl(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(jar.isEmpty() ? {} : { Cookie: jar.header() }),
        ...(isSignIn
          ? { 'Content-Type': 'application/json', Origin: appUrl }
          : {}),
        ...headers,
      },
      method,
      redirect: 'manual',
    });
    jar.store(response);
    return response;
  }

  async function step(label, run) {
    try {
      await run();
    } catch (error) {
      const failure = new Error(error.message);
      failure.step = label;
      failure.passed = [...passed];
      throw failure;
    }
    passed.push(label);
  }

  let token;

  await step('sign-in', async () => {
    const response = await send(`${appUrl}/v1/auth/sign-in/email`, {
      body: { email, password },
      method: 'POST',
    });
    expect(response.status === 200, `sign-in returned HTTP ${response.status}`);
    expect(!jar.isEmpty(), 'sign-in did not set a session cookie');
  });

  await step('session', async () => {
    const response = await send(`${appUrl}/v1/auth/get-session`);
    expect(
      response.status === 200,
      `get-session returned HTTP ${response.status}`,
    );
    const session = await readJson(response);
    expect(
      typeof session?.user?.id === 'string' &&
        session.user.email?.toLowerCase() === email.toLowerCase(),
      'get-session did not return the canary session',
    );
  });

  await step('token', async () => {
    const response = await send(`${appUrl}/v1/auth/token`);
    expect(response.status === 200, `token returned HTTP ${response.status}`);
    token = (await readJson(response))?.token;
    expect(
      typeof token === 'string' && token.length > 0,
      'token exchange returned no token',
    );
  });

  await step('app-shell', async () => {
    let url = `${appUrl}/`;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await send(url, { headers: { Accept: 'text/html' } });
      await response.arrayBuffer();
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString();
        const { pathname } = new URL(url);
        expect(
          !UNSIGNED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
          `app shell redirected the signed-in canary to ${pathname}`,
        );
        continue;
      }
      expect(
        response.status === 200,
        `app shell returned HTTP ${response.status}`,
      );
      const { pathname } = new URL(url);
      expect(
        !UNSIGNED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
        `app shell served ${pathname} to the signed-in canary`,
      );
      return;
    }
    throw new Error(`app shell redirected more than ${MAX_REDIRECTS} times`);
  });

  await step('organizations', async () => {
    const response = await send(`${apiUrl}/v1/organizations?mine=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(
      response.status === 200,
      `organizations?mine=true returned HTTP ${response.status}`,
    );
    const organizations = await readJson(response);
    expect(
      Array.isArray(organizations) &&
        organizations.length > 0 &&
        organizations.every((organization) => organization?.id),
      'organizations?mine=true returned no organization for the canary',
    );
  });

  return passed;
}

export async function smokeSignedInWithRetry({
  attempts,
  delaySeconds,
  log = console.log,
  ...options
}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await smokeSignedIn(options);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log(
        `Signed-in smoke attempt ${attempt}/${attempts} failed at ${error.step}: ${error.message}`,
      );
      await sleep(delaySeconds * 1000);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({
    options: {
      'api-url': { type: 'string' },
      'app-url': { type: 'string' },
      attempts: { default: '2', type: 'string' },
      'delay-seconds': { default: '5', type: 'string' },
    },
  });
  const email = process.env.CANARY_EMAIL ?? '';
  const password = process.env.CANARY_PASSWORD ?? '';
  if (!values['app-url'] || !values['api-url']) {
    console.error(
      'Usage: signed-in-smoke.mjs --app-url <url> --api-url <url> (CANARY_EMAIL and CANARY_PASSWORD in the environment)',
    );
    process.exit(5);
  }
  if (!email || !password) {
    console.error(
      '::error::CANARY_EMAIL and CANARY_PASSWORD must be set on the production environment',
    );
    process.exit(5);
  }
  try {
    const passed = await smokeSignedInWithRetry({
      apiUrl: values['api-url'],
      appUrl: values['app-url'],
      attempts: Number(values.attempts),
      delaySeconds: Number(values['delay-seconds']),
      email,
      password,
    });
    for (const label of passed) console.log(`- ${label}: ok`);
  } catch (error) {
    for (const label of error.passed ?? []) console.log(`- ${label}: ok`);
    console.log(`- ${error.step}: FAILED (${error.message})`);
    console.error(
      `::error::Signed-in smoke failed at step "${error.step}": ${error.message}`,
    );
    process.exit(1);
  }
}
