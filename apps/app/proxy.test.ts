import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const SESSION_TOKEN = 'test-session-token';
const BEARER_TOKEN = 'test-bearer-token';
const SESSION_COOKIE_NAME = 'better-auth.session_token';

/**
 * Build a signed-in NextRequest-like mock.
 *
 * proxy.ts needs two things for a Better Auth session:
 *  1. `req.cookies.get('better-auth.session_token')` → `{ value: SESSION_TOKEN }`
 *     (used by `getBetterAuthSessionCookie` to set `hasSession=true`)
 *  2. `req.headers.get('cookie')` → the raw cookie header string
 *     (used by `getBetterAuthBearerToken` to call `/v1/auth/token`)
 *
 * Extra cookie overrides (e.g. `gf_ws`) can be provided via `extraCookies`.
 */
function makeSignedInRequest(
  pathname: string,
  opts: {
    extraCookies?: Record<string, string>;
    search?: string;
  } = {},
) {
  const cookieMap: Record<string, string> = {
    [SESSION_COOKIE_NAME]: SESSION_TOKEN,
    ...opts.extraCookies,
  };
  const rawCookieHeader = Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return {
    cookies: {
      get: vi.fn((name: string) => {
        const value = cookieMap[name];
        return value !== undefined ? { value } : undefined;
      }),
    },
    headers: {
      get: vi.fn((name: string) =>
        name.toLowerCase() === 'cookie' ? rawCookieHeader : null,
      ),
    },
    nextUrl: {
      pathname,
      search: opts.search ?? '',
    },
    url: `http://localhost:3000${pathname}${opts.search ?? ''}`,
  } as never;
}

/**
 * Build a signed-out NextRequest-like mock (no session cookie present).
 */
function makeSignedOutRequest(pathname: string, search?: string) {
  return {
    cookies: {
      get: vi.fn(() => undefined),
    },
    headers: {
      get: vi.fn(() => null),
    },
    nextUrl: {
      pathname,
      search: search ?? '',
    },
    url: `http://localhost:3000${pathname}${search ?? ''}`,
  } as never;
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_ENABLED', 'true');
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-better-auth-secret');
    vi.stubEnv('API_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_API_ENDPOINT', 'http://localhost:3010/v1');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.resetModules();
    globalThis.fetch = fetchMock as typeof fetch;

    // Default fetch mock handles all three Better Auth endpoints proxy.ts calls:
    //   1. GET /v1/auth/token  – exchanges the session cookie for a bearer token
    //   2. GET /v1/auth/bootstrap – returns brands + access info
    //   3. GET /v1/organizations/mine – fallback org slug resolution
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: { brandId: 'brand_1' },
            brands: [{ id: 'brand_1', slug: 'moonrise-studio' }],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations/mine')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── Signed-in redirect away from root / public entry points ──────────────

  it('does not force-redirect a signed-in user off a public auth page', async () => {
    // /login is a real Better Auth public page (isBetterAuthPublicRoute). proxy
    // only auto-redirects at the root path; on /login it passes through and lets
    // the page itself handle any client-side redirect. So a signed-in user on
    // /login is NOT bounced by the proxy (no 307, no Location).
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/login'), {} as never);

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects a signed-out user on a protected route to /login', async () => {
    // No session cookie → getBetterAuthSessionCookie returns null → the auth
    // gate sends any non-public protected route to /login.
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest('/acme/moonrise-studio/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('normalizes a bare API_URL origin before calling versioned auth endpoints', async () => {
    vi.stubEnv('API_URL', 'http://localhost:3010');
    vi.resetModules();

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/token',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/bootstrap',
    );
  });

  it('redirects signed-in root to workspace when single brand', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('redirects signed-in root to org overview when no brand is selected', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: {},
            brands: [{ id: 'brand_1', slug: 'moonrise-studio' }],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations/mine')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/overview',
    );
  });

  it('redirects signed-in root to onboarding when no workspace exists', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            brands: [],
            currentUser: { id: 'user_1' },
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding',
    );
  });

  it('redirects signed-in root to active brand workspace when multiple brands', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: { brandId: 'brand_1' },
            brands: [
              { id: 'brand_1', slug: 'moonrise-studio' },
              { id: 'brand_2', slug: 'second-brand' },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations/mine')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('falls through on root when slug resolution fails', async () => {
    // Token exchange succeeds but bootstrap (slug resolution) returns an error.
    // Both resolveCanonicalProtectedPath and shouldRedirectSignedInUserToOnboarding
    // return null/false → falls through to NextResponse.next() (200).
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }
      return new Response('error', { status: 500 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(200);
  });

  it('falls through on root when slug resolution fetch rejects', async () => {
    // Token exchange succeeds; bootstrap fetch throws (network error).
    // resolveCanonicalProtectedPath catches the rejection and returns null
    // → shouldRedirectSignedInUserToOnboarding also returns false → fall through.
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }
      throw new TypeError('fetch failed');
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(200);
  });

  it('redirects unauthenticated root to login', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedOutRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('redirects signed-in flat protected routes to the canonical org and brand path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('redirects signed-in flat protected routes to org views when no brand is selected', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: {},
            brands: [{ id: 'brand_1', slug: 'moonrise-studio' }],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations/mine')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const postsResponse = await proxy(
      makeSignedInRequest('/posts'),
      {} as never,
    );

    expect(postsResponse.status).toBe(307);
    expect(postsResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/posts',
    );

    const workspaceResponse = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(workspaceResponse.status).toBe(307);
    expect(workspaceResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/overview',
    );
  });

  it('keeps personal settings canonical when no brand is selected', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: {},
            brands: [{ id: 'brand_1', slug: 'moonrise-studio' }],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations/mine')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/settings/personal'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/settings',
    );
  });

  it('redirects signed-in bare protected routes to onboarding when no projects exist', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            brands: [],
            currentUser: { id: 'user_1' },
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding',
    );
  });

  it('redirects scoped app routes to onboarding when no projects exist', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            brands: [],
            currentUser: { id: 'user_1' },
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/~/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding',
    );
  });

  it('does not gate brand-scoped routes through the onboarding bootstrap check', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({ brands: [], currentUser: { id: 'user_1' } }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/posts'),
      {} as never,
    );

    // Brand-scoped paths must fall through, never the org-root (~) onboarding
    // gate, and must not trigger a bootstrap fetch on every navigation.
    expect(response.headers.get('location')).not.toBe(
      'http://localhost:3000/onboarding',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/bootstrap'),
      ),
    ).toBe(false);
  });

  it('redirects signed-in flat chat to the canonical org-scoped chat path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/agent'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/agent',
    );
  });

  it('keeps signed-in personal settings on the canonical personal route', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/settings'), {} as never);

    expect(response.status).toBe(200);
  });

  it('redirects desktop shell bare settings to seeded workspace without a desktop token', async () => {
    const previousDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    const previousBetterAuthEnabled =
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    const previousSecretKey = process.env.BETTER_AUTH_SECRET;

    try {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
      delete process.env.BETTER_AUTH_SECRET;
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

      vi.resetModules();
      const { default: proxy } = await import('./proxy');

      const response = await proxy(
        {
          cookies: { get: vi.fn() },
          headers: { get: vi.fn(() => null) },
          nextUrl: { pathname: '/settings', search: '' },
          url: 'http://localhost:3000/settings',
        } as never,
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/default/default/workspace/overview',
      );
    } finally {
      if (previousDesktopShell === undefined) {
        delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
      } else {
        process.env.NEXT_PUBLIC_DESKTOP_SHELL = previousDesktopShell;
      }

      if (previousBetterAuthEnabled === undefined) {
        delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = previousBetterAuthEnabled;
      }

      if (previousSecretKey === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = previousSecretKey;
      }
    }
  });

  it('redirects signed-in legacy org settings routes to the canonical org settings path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/settings/organization/members'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/settings/members',
    );
  });

  it('does not preserve legacy brand settings detail routes as a compatibility layer', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/settings/brands/moonrise-studio/voice'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/settings/brands/moonrise-studio/voice',
    );
  });

  it('uses the bootstrap organization slug without fetching organizations', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/token')) {
        return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
          status: 200,
        });
      }

      if (url.endsWith('/auth/bootstrap')) {
        return new Response(
          JSON.stringify({
            access: { brandId: 'brand_1' },
            brands: [
              {
                id: 'brand_1',
                organization: { slug: 'acme' },
                slug: 'moonrise-studio',
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/organizations/mine'),
      ),
    ).toBe(false);
  });

  it('redirects signed-out protected routes to login instead of invoking legacy auth provider dev handshake', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest('/settings/organization/members'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('falls through on signed-in public routes when canonical slug resolution fails', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response('error', { status: 500 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/login'), {} as never);

    expect(response.status).toBe(200);
  });

  it('canonicalizes bare protected routes in desktop shell mode when a desktop token is present', async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        headers: {
          get: vi.fn((name: string) => {
            return name === 'x-genfeed-desktop-token' ? 'token_1' : null;
          }),
        },
        nextUrl: { pathname: '/workspace/overview', search: '' },
        url: 'http://localhost:3000/workspace/overview',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );

    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'pk_test';
    process.env.BETTER_AUTH_SECRET = 'sk_test';
  });

  it('redirects desktop shell root to login when the injected desktop token is stale', async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    fetchMock.mockImplementation(
      async () => new Response('error', { status: 500 }),
    );

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        headers: {
          get: vi.fn((name: string) => {
            return name === 'x-genfeed-desktop-token' ? 'stale_token' : null;
          }),
        },
        nextUrl: { pathname: '/', search: '' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );

    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'pk_test';
    process.env.BETTER_AUTH_SECRET = 'sk_test';
  });

  it('skips API call when valid slug cookie is present', async () => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long!!';

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const firstResponse = await proxy(
      makeSignedInRequest('/workspace/overview'),
      {} as never,
    );

    expect(firstResponse.status).toBe(307);
    expect(firstResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );

    const setCookieHeader = firstResponse.headers.get('set-cookie') ?? '';
    const cookieMatch = setCookieHeader.match(/gf_ws=([^;]+)/);
    expect(cookieMatch).toBeTruthy();
    const cookieValue = cookieMatch?.[1];

    fetchMock.mockClear();

    const secondResponse = await proxy(
      makeSignedInRequest('/posts', {
        extraCookies: { gf_ws: cookieValue ?? '' },
      }),
      {} as never,
    );

    expect(secondResponse.status).toBe(307);
    expect(secondResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/posts',
    );
    // The slug cookie caches org/brand slugs — the expensive bootstrap and org
    // resolution fetches must be skipped. The Better Auth token exchange
    // (/auth/token) is a required per-request step and is expected to be called.
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/bootstrap'),
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/organizations/mine'),
      ),
    ).toBe(false);

    delete process.env.COOKIE_SECRET;
  });

  it('falls back to API when cookie is expired or tampered', async () => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long!!';

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/overview', {
        extraCookies: { gf_ws: 'tampered.cookie' },
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(fetchMock).toHaveBeenCalled();

    delete process.env.COOKIE_SECRET;
  });

  it('deletes slug cookie on logout', async () => {
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/logout', search: '' },
        url: 'http://localhost:3000/logout',
      } as never,
      {} as never,
    );

    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain('gf_ws');
    expect(setCookieHeader).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it('lets desktop shell login render when the injected desktop token is stale', async () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    fetchMock.mockImplementation(
      async () => new Response('error', { status: 500 }),
    );

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        headers: {
          get: vi.fn((name: string) => {
            return name === 'x-genfeed-desktop-token' ? 'stale_token' : null;
          }),
        },
        nextUrl: { pathname: '/login', search: '' },
        url: 'http://localhost:3000/login',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);

    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'pk_test';
    process.env.BETTER_AUTH_SECRET = 'sk_test';
  });
});
