import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IDesktopEnvironment } from '@genfeedai/contracts/desktop';
import type { DesktopCookieStore } from './session.service';
import type { DesktopKeyValueStore } from './store.service';
import './test-support/electron.mock';

const { DesktopSessionService } = await import('./session.service');

const APP_ORIGIN = 'http://127.0.0.1:3230';
const SESSION_STORAGE_KEY = 'desktop.session';
const TEST_ENVIRONMENT: IDesktopEnvironment = {
  apiEndpoint: 'https://api.genfeed.ai/v1',
  appEndpoint: APP_ORIGIN,
  appName: 'desktop',
  appPort: 3230,
  authEndpoint: 'https://app.genfeed.ai/oauth/cli',
  cdnUrl: 'https://cdn.genfeed.ai',
  wsEndpoint: 'https://notifications.genfeed.ai',
};
const VALID_COOKIE = {
  cookieName: 'better-auth.session_token',
  cookieValue: 'token.signature',
  expiresAt: '2099-09-04T12:00:00.000Z',
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: false,
} as const;

type CookieRemoveCall = Parameters<DesktopCookieStore['remove']>;
type CookieSetDetails = Parameters<DesktopCookieStore['set']>[0];

interface CookieMock {
  cookies: DesktopCookieStore;
  jar: Map<string, string>;
  removeCalls: CookieRemoveCall[];
  setCalls: CookieSetDetails[];
}

type KvMock = DesktopKeyValueStore & {
  values: Map<string, string>;
};

const createKvMock = (): KvMock => {
  const values = new Map<string, string>();

  return {
    deleteValue: async (key: string) => {
      values.delete(key);
    },
    getValue: async (key: string) => values.get(key) ?? null,
    getValueSync: (key: string) => values.get(key) ?? null,
    setValue: async (key: string, value: string) => {
      values.set(key, value);
    },
    setValueSync: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  } as unknown as KvMock;
};

const createCookieMock = (): CookieMock => {
  const removeCalls: CookieRemoveCall[] = [];
  const setCalls: CookieSetDetails[] = [];
  // Mirrors a real cookie jar: `get` only returns what `set` actually retained,
  // so a jar that silently drops the cookie is expressible in tests.
  const jar = new Map<string, string>();

  return {
    cookies: {
      get: async ({ name }: { name: string; url: string }) => {
        const value = jar.get(name);

        return value === undefined ? [] : [{ name, value }];
      },
      remove: async (...args: CookieRemoveCall) => {
        removeCalls.push(args);
        jar.delete(args[1]);
      },
      set: async (details: CookieSetDetails) => {
        setCalls.push(details);
        jar.set(details.name, details.value);
      },
    },
    jar,
    removeCalls,
    setCalls,
  };
};

const createSessionService = (kvService: KvMock, cookieMock: CookieMock) =>
  new DesktopSessionService(
    kvService,
    TEST_ENVIRONMENT,
    APP_ORIGIN,
    cookieMock.cookies,
  );

const createSession = () => ({
  issuedAt: '2026-08-05T12:00:00.000Z',
  sessionCookie: VALID_COOKIE,
  token: 'gf_desktop_key',
  userEmail: 'desktop@example.com',
  userId: 'user-123',
  userName: 'Desktop User',
});

const stubWhoami = (): void => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          user: {
            email: 'desktop@example.com',
            id: 'user-123',
            name: 'Desktop User',
          },
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    )) as typeof fetch;
};

describe('DesktopSessionService', () => {
  const originalFetch = globalThis.fetch;
  let cookieMock: CookieMock;
  let kvService: KvMock;

  beforeEach(() => {
    cookieMock = createCookieMock();
    kvService = createKvMock();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds a desktop-specific PKCE OAuth URL', () => {
    const service = createSessionService(kvService, cookieMock);
    const loginUrl = new URL(service.getLoginUrl());

    expect(loginUrl.origin).toBe('https://app.genfeed.ai');
    expect(loginUrl.pathname).toBe('/oauth/cli');
    expect(loginUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loginUrl.searchParams.get('desktop')).toBe('1');
    expect(loginUrl.searchParams.get('return_to')).toBe(
      'genfeedai-desktop://auth',
    );
  });

  it('persists the cookie descriptor and re-applies it on restart', async () => {
    const firstService = createSessionService(kvService, cookieMock);
    await firstService.setSession(createSession());

    expect(kvService.values.get(SESSION_STORAGE_KEY)).toContain(
      'better-auth.session_token',
    );
    expect(cookieMock.setCalls[0]).toMatchObject({
      expirationDate: Math.floor(Date.parse(VALID_COOKIE.expiresAt) / 1_000),
      httpOnly: true,
      name: VALID_COOKIE.cookieName,
      path: '/',
      sameSite: 'lax',
      secure: false,
      url: APP_ORIGIN,
      value: VALID_COOKIE.cookieValue,
    });

    const restartCookieMock = createCookieMock();
    const restartedService = createSessionService(kvService, restartCookieMock);
    stubWhoami();

    await expect(restartedService.validateStoredSession()).resolves.toEqual(
      createSession(),
    );
    expect(restartCookieMock.setCalls.length).toBeGreaterThanOrEqual(1);
    expect(restartCookieMock.setCalls[0]?.url).toBe(APP_ORIGIN);
  });

  it('installs a __Secure- prefixed cookie on the loopback origin unrenamed', async () => {
    const service = createSessionService(kvService, cookieMock);
    const secureSession = {
      ...createSession(),
      sessionCookie: {
        ...VALID_COOKIE,
        cookieName: '__Secure-better-auth.session_token',
        secure: true,
      },
    };

    await service.setSession(secureSession);

    expect(cookieMock.setCalls[0]).toMatchObject({
      name: '__Secure-better-auth.session_token',
      secure: true,
      url: APP_ORIGIN,
    });
    expect(cookieMock.jar.get('__Secure-better-auth.session_token')).toBe(
      VALID_COOKIE.cookieValue,
    );
  });

  it('fails loudly when the cookie jar silently drops the session cookie', async () => {
    // `set` resolves but retains nothing — the exact failure mode that would
    // otherwise leave the renderer unauthenticated with no error surfaced.
    cookieMock.cookies.set = async (details: CookieSetDetails) => {
      cookieMock.setCalls.push(details);
    };
    const service = createSessionService(kvService, cookieMock);

    await expect(service.setSession(createSession())).rejects.toThrow(
      /not retained by the cookie jar.*name=better-auth\.session_token.*url=http:\/\/127\.0\.0\.1:3230/s,
    );
    expect(kvService.values.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('discards an expired descriptor before validating the API key', async () => {
    const expiredSession = {
      ...createSession(),
      sessionCookie: {
        ...VALID_COOKIE,
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    };
    kvService.values.set(SESSION_STORAGE_KEY, JSON.stringify(expiredSession));
    globalThis.fetch = (async () => {
      throw new Error('Expired sessions must not reach the API.');
    }) as typeof fetch;

    const service = createSessionService(kvService, cookieMock);

    await expect(service.validateStoredSession()).resolves.toBeNull();
    expect(kvService.values.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(cookieMock.removeCalls).toEqual([
      [APP_ORIGIN, VALID_COOKIE.cookieName],
    ]);
  });

  it('clears both the shell cookie and API key on sign-out', async () => {
    const service = createSessionService(kvService, cookieMock);
    await service.setSession(createSession());

    await service.clearSession();

    expect(kvService.values.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(cookieMock.removeCalls).toEqual([
      [APP_ORIGIN, VALID_COOKIE.cookieName],
    ]);
  });

  it('restores the API key if cookie removal fails during sign-out', async () => {
    cookieMock.cookies.remove = async () => {
      throw new Error('cookie store unavailable');
    };
    const service = createSessionService(kvService, cookieMock);
    await service.setSession(createSession());

    await expect(service.clearSession()).rejects.toThrow(
      'cookie store unavailable',
    );
    expect(service.getSession()).toEqual(createSession());
  });

  it('exchanges a PKCE code and persists the exact signed cookie', async () => {
    const service = createSessionService(kvService, cookieMock);
    const loginUrl = new URL(service.getLoginUrl());
    const state = loginUrl.searchParams.get('state');

    if (!state) {
      throw new Error('Expected login URL state');
    }

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          issuedAt: '2026-08-05T12:00:00.000Z',
          session: VALID_COOKIE,
          token: 'gf_desktop_key',
          userEmail: 'desktop@example.com',
          userId: 'user-123',
          userName: 'Desktop User',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: init?.method === 'POST' ? 200 : 500,
        },
      )) as typeof fetch;

    await expect(
      service.handleCallback(
        `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
      ),
    ).resolves.toEqual({
      isOk: true,
      session: createSession(),
    });
    expect(cookieMock.setCalls[0]?.value).toBe('token.signature');
  });

  it('treats a 2xx exchange without a session descriptor as recoverable', async () => {
    const service = createSessionService(kvService, cookieMock);
    const loginUrl = new URL(service.getLoginUrl());
    const state = loginUrl.searchParams.get('state');

    if (!state) {
      throw new Error('Expected login URL state');
    }

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          issuedAt: '2026-08-05T12:00:00.000Z',
          token: 'gf_desktop_key',
          userId: 'user-123',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      )) as typeof fetch;

    await expect(
      service.handleCallback(
        `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
      ),
    ).resolves.toMatchObject({
      error: { code: 'session-cookie-unavailable' },
      isOk: false,
    });
    expect(kvService.values.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(cookieMock.setCalls).toEqual([]);
  });

  it('builds a PKCE callback URL from a pasted authorize code', () => {
    const service = createSessionService(kvService, cookieMock);
    const loginUrl = new URL(service.getLoginUrl());
    const state = loginUrl.searchParams.get('state');

    if (!state) {
      throw new Error('Expected login URL state');
    }

    expect(service.buildCallbackUrlFromPaste('desktop-code')).toBe(
      `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
    );
    expect(
      service.buildCallbackUrlFromPaste(
        `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
      ),
    ).toBe(`genfeedai-desktop://auth?code=desktop-code&state=${state}`);
    expect(service.buildCallbackUrlFromPaste('https://evil.example/x')).toBe(
      null,
    );
    expect(service.buildCallbackUrlFromPaste('')).toBe(null);
  });

  it('does not accept a pasted code before sign-in starts', () => {
    const service = createSessionService(kvService, cookieMock);

    expect(service.buildCallbackUrlFromPaste('desktop-code')).toBe(null);
  });

  it('restores a pending PKCE paste after the process restarts', () => {
    const firstService = createSessionService(kvService, cookieMock);
    const loginUrl = new URL(firstService.getLoginUrl());
    const state = loginUrl.searchParams.get('state');

    if (!state) {
      throw new Error('Expected login URL state');
    }

    const restartedService = createSessionService(kvService, cookieMock);

    expect(restartedService.buildCallbackUrlFromPaste('desktop-code')).toBe(
      `genfeedai-desktop://auth?code=desktop-code&state=${state}`,
    );
  });

  it('exchanges a pasted authorize code', async () => {
    const service = createSessionService(kvService, cookieMock);
    service.getLoginUrl();

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          issuedAt: '2026-08-05T12:00:00.000Z',
          session: VALID_COOKIE,
          token: 'gf_desktop_key',
          userEmail: 'desktop@example.com',
          userId: 'user-123',
          userName: 'Desktop User',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: init?.method === 'POST' ? 200 : 500,
        },
      )) as typeof fetch;

    const callbackUrl = service.buildCallbackUrlFromPaste('desktop-code');

    if (!callbackUrl) {
      throw new Error('Expected a callback URL from the pasted code');
    }

    await expect(service.handleCallback(callbackUrl)).resolves.toEqual({
      isOk: true,
      session: createSession(),
    });
    expect(service.buildCallbackUrlFromPaste('desktop-code')).toBe(null);
  });

  it('keeps pending PKCE after a 401 exchange so the same code can be retried', async () => {
    const service = createSessionService(kvService, cookieMock);
    service.getLoginUrl();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              code: '401',
              detail: 'No token provided',
              title: 'Unauthorized',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 401,
        },
      )) as typeof fetch;

    const callbackUrl = service.buildCallbackUrlFromPaste('desktop-code');

    if (!callbackUrl) {
      throw new Error('Expected a callback URL from the pasted code');
    }

    await expect(service.handleCallback(callbackUrl)).resolves.toMatchObject({
      error: {
        code: 'exchange-failed',
        message:
          'The Genfeed API blocked desktop sign-in as unauthorized. POST /auth/desktop/exchange must be public.',
      },
      isOk: false,
    });
    expect(service.buildCallbackUrlFromPaste('desktop-code')).toBe(callbackUrl);
  });

  it('surfaces expired-code details from a failed exchange', async () => {
    const service = createSessionService(kvService, cookieMock);
    service.getLoginUrl();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              code: '400',
              detail: 'Expired desktop authorization code',
              title: 'Bad Request',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 400,
        },
      )) as typeof fetch;

    const callbackUrl = service.buildCallbackUrlFromPaste('desktop-code');

    if (!callbackUrl) {
      throw new Error('Expected a callback URL from the pasted code');
    }

    await expect(service.handleCallback(callbackUrl)).resolves.toMatchObject({
      error: {
        code: 'exchange-failed',
        message: 'Expired desktop authorization code',
      },
      isOk: false,
    });
  });
});
