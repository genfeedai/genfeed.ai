import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
    method?: string;
    nextAction?: string;
    nextUrl?: string;
    referer?: string;
    rsc?: boolean;
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

  const search = opts.search ?? '';
  return {
    cookies: {
      get: vi.fn((name: string) => {
        const value = cookieMap[name];
        return value !== undefined ? { value } : undefined;
      }),
    },
    headers: {
      get: vi.fn((name: string) => {
        const normalizedName = name.toLowerCase();
        if (normalizedName === 'cookie') {
          return rawCookieHeader;
        }
        if (normalizedName === 'referer') {
          return opts.referer ?? null;
        }
        if (normalizedName === 'rsc') {
          return opts.rsc ? '1' : null;
        }
        if (normalizedName === 'next-action') {
          return opts.nextAction ?? null;
        }
        if (normalizedName === 'next-url') {
          return opts.nextUrl ?? null;
        }
        return null;
      }),
    },
    method: opts.method ?? 'GET',
    nextUrl: {
      origin: 'http://localhost:3000',
      pathname,
      search,
      // proxy reads callbackUrl via nextUrl.searchParams.get(...)
      searchParams: new URLSearchParams(
        search.startsWith('?') ? search.slice(1) : search,
      ),
    },
    url: `http://localhost:3000${pathname}${search}`,
  } as never;
}

/**
 * Build a signed-out NextRequest-like mock (no session cookie present).
 */
function makeSignedOutRequest(pathname: string, search?: string) {
  const resolvedSearch = search ?? '';
  return {
    cookies: {
      get: vi.fn(() => undefined),
    },
    headers: {
      get: vi.fn(() => null),
    },
    nextUrl: {
      pathname,
      search: resolvedSearch,
      searchParams: new URLSearchParams(
        resolvedSearch.startsWith('?')
          ? resolvedSearch.slice(1)
          : resolvedSearch,
      ),
    },
    url: `http://localhost:3000${pathname}${resolvedSearch}`,
  } as never;
}

interface DesktopRequestOptions {
  desktopToken?: string;
  desktopVersion?: string | null;
  hasSession: boolean;
  search?: string;
}

function makeDesktopRequest(
  pathname: string,
  {
    desktopToken,
    desktopVersion = '0.1.0',
    hasSession,
    search = '',
  }: DesktopRequestOptions,
) {
  const cookieMap: Record<string, string> = hasSession
    ? { [SESSION_COOKIE_NAME]: SESSION_TOKEN }
    : {};
  const rawCookieHeader = Object.entries(cookieMap)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  return {
    cookies: {
      get: vi.fn((name: string) => {
        const value = cookieMap[name];
        return value !== undefined ? { value } : undefined;
      }),
    },
    headers: {
      get: vi.fn((name: string) => {
        const normalizedName = name.toLowerCase();
        if (normalizedName === 'cookie') {
          return rawCookieHeader || null;
        }
        if (normalizedName === 'x-genfeed-desktop-token') {
          return desktopToken ?? null;
        }
        if (normalizedName === 'x-genfeed-desktop-version') {
          return desktopVersion;
        }
        return null;
      }),
    },
    nextUrl: {
      pathname,
      search,
      searchParams: new URLSearchParams(
        search.startsWith('?') ? search.slice(1) : search,
      ),
    },
    url: `http://localhost:3000${pathname}${search}`,
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
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('GENFEED_DESKTOP_MINIMUM_VERSION', undefined);
    vi.resetModules();
    globalThis.fetch = fetchMock as typeof fetch;

    // Default fetch mock handles all three Better Auth endpoints proxy.ts calls:
    //   1. GET /v1/auth/token  – exchanges the session cookie for a bearer token
    //   2. GET /v1/auth/bootstrap – returns brands + access info
    //   3. GET /v1/organizations?mine=true – fallback org slug resolution
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

      if (url.endsWith('/organizations?mine=true')) {
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['/api/version', '/v1', '/v1/auth/get-session', '/v1/health'])(
    'passes the same-origin API proxy route %s through without app auth routing',
    async (pathname) => {
      const { default: proxy } = await import('./proxy');

      const response = await proxy(makeSignedOutRequest(pathname), {} as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('repairs an API namespace poisoned workspace URL from canonical access data', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/api/werwer/workspace/inbox/unread'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/inbox/unread',
    );
  });

  // The service worker precaches /~offline at install time. If the proxy
  // redirected it to /login, that redirect would be stored as the offline
  // fallback and a signed-in user with no network would see a login page.
  it.each(['/~offline', '/serwist/sw.js', '/serwist/sw.js.map'])(
    'passes the service worker route %s through without app auth routing',
    async (pathname) => {
      const { default: proxy } = await import('./proxy');

      const response = await proxy(makeSignedOutRequest(pathname), {} as never);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  // ─── Signed-in redirect away from root / public entry points ──────────────

  it.each(['/login', '/login/password', '/login/magic-link'])(
    'redirects a signed-in user away from %s honoring callbackUrl',
    async (pathname) => {
      const { default: proxy } = await import('./proxy');

      const response = await proxy(
        makeSignedInRequest(pathname, {
          search: '?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
        }),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/oauth/cli?port=4321',
      );
    },
  );

  it('redirects a signed-in user on /login without callbackUrl to workspace overview', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/login'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('ignores an API callbackUrl when redirecting a signed-in user', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/login', {
        search: '?callbackUrl=%2Fapi%2Fversion',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it.each([
    '/api#fragment',
    '/robots.txt',
    '/login',
    '/logout',
    '/sign-up',
    '/?callbackUrl=%2Fonboarding',
  ])('ignores the non-product callbackUrl %s', async (callbackUrl) => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/login', {
        search: `?callbackUrl=${encodeURIComponent(callbackUrl)}`,
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('falls back from an unauthorized brand continuation on the fixed root callback', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/', {
        search:
          '?callbackUrl=%2Facme%2Fforeign-brand%2Flibrary%2Fassets%3Ftab%3Ddrafts',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('preserves an authorized scoped continuation on the fixed root callback', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/', {
        search:
          '?callbackUrl=%2Facme%2Fmoonrise-studio%2Flibrary%2Fassets%3Ftab%3Ddrafts',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/library/assets?tab=drafts',
    );
  });

  it('preserves the validated root continuation when the session must be restored', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest(
        '/',
        '?callbackUrl=%2Facme%2F~%2Fsettings%2Fcredits',
      ),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe(
      '/acme/~/settings/credits',
    );
  });

  it('falls back from a stale org callback after session restore through /login', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/login', {
        search: '?callbackUrl=%2Fdefault%2F%7E%2Fsettings%2Fcredits',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('preserves an authorized brand callback after session restore through /login', async () => {
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
              {
                id: 'brand_2',
                organization: { slug: 'acme' },
                slug: 'second-brand',
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
      makeSignedInRequest('/login', {
        search:
          '?callbackUrl=%2Facme%2Fsecond-brand%2Flibrary%2Fassets%3Ftab%3Ddrafts',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/second-brand/library/assets?tab=drafts',
    );
  });

  it('keeps logout reachable for a signed-in user', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/logout'), {} as never);

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects a signed-out user on a protected route to /login preserving the destination', async () => {
    // No session cookie → getBetterAuthSessionCookie returns null → the auth
    // gate sends any non-public protected route to /login. Finding #25: the
    // route the user was heading to is preserved as `callbackUrl` so the login
    // flow returns them there after auth instead of stranding them on the
    // seeded workspace.
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest('/acme/moonrise-studio/workspace'),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe(
      '/acme/moonrise-studio/workspace',
    );
  });

  it('preserves the query string of the destination in the login callbackUrl', async () => {
    // The whole original destination — pathname *and* search — round-trips
    // through `callbackUrl` so deep links with query params survive the bounce.
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest('/acme/moonrise-studio/library?tab=drafts'),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe(
      '/acme/moonrise-studio/library?tab=drafts',
    );
  });

  it.each(['/forgot-password', '/reset-password'])(
    'lets signed-out users render public reset route %s',
    async (pathname) => {
      const { default: proxy } = await import('./proxy');

      const response = await proxy(makeSignedOutRequest(pathname), {} as never);

      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it.each([
    ['/acme/~/automation/workflows', '/acme/~/automation/workflows'],
    [
      '/acme/~/automation/workflows/workflow-42',
      '/acme/~/automation/workflows/workflow-42',
    ],
    [
      '/acme/moonrise-studio/automation/workflows',
      '/acme/moonrise-studio/automation/workflows',
    ],
    [
      '/acme/moonrise-studio/automation/workflows/workflow-42',
      '/acme/moonrise-studio/automation/workflows/workflow-42',
    ],
  ])('preserves canonical scoped workflow route %s', async (pathname) => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest(pathname, { search: '?view=runs' }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not interpret the platform Admin workflow page as tenant scope', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest(APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not treat the deleted request-access route as public', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedOutRequest('/request-access'),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe('/request-access');
  });

  it('normalizes a bare API_URL origin before calling versioned auth endpoints', async () => {
    vi.stubEnv('API_URL', 'http://localhost:3010');
    vi.resetModules();

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace'),
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

  it('redirects signed-in root to the active workspace overview', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('preserves root task context for workspace overview', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/', {
        search: '?taskSource=workspace&taskId=task-42',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview?taskSource=workspace&taskId=task-42',
    );
  });

  it('redirects signed-in root to the shared brand step when a seeded brand exists but onboarding is incomplete', async () => {
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
            access: { brandId: 'brand_1', isOnboardingCompleted: false },
            brands: [{ id: 'brand_1', slug: 'default' }],
            currentUser: {
              id: 'user_1',
              isOnboardingCompleted: false,
              onboardingStepsCompleted: [],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations?mine=true')) {
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
      'http://localhost:3000/onboarding/brand',
    );
  });

  describe('agent-first onboarding', () => {
    const mockIncompleteUser = (
      organizations: Array<{ isActive: boolean; slug: string }> = [
        { isActive: true, slug: 'acme' },
      ],
      completedSteps: string[] = [],
    ) =>
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
              access: { brandId: 'brand_1', isOnboardingCompleted: false },
              brands: [{ id: 'brand_1', slug: 'default' }],
              currentUser: {
                id: 'user_1',
                isOnboardingCompleted: false,
                onboardingStepsCompleted: completedSteps,
              },
            }),
            { status: 200 },
          );
        }

        if (url.endsWith('/organizations?mine=true')) {
          return new Response(JSON.stringify(organizations), { status: 200 });
        }

        return new Response('not found', { status: 404 });
      });

    it('redirects an incomplete SaaS user on a protected route to the shared brand step', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/default/workspace'),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboarding/brand',
      );
    });

    it('pulls an incomplete SaaS user off agent onboarding until brand is confirmed', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/~/agent/onboarding'),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboarding/brand',
      );
    });

    it('lets a SaaS user stay on agent onboarding after the shared brand step', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser([{ isActive: true, slug: 'acme' }], ['brand']);

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/~/agent/onboarding'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });

    it('moves an incomplete user off a leftover org onboarding URL onto their membership org', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser([{ isActive: true, slug: 'acme' }], ['brand']);

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/default-organization/~/agent/onboarding'),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/acme/~/agent/onboarding',
      );
    });

    it('redirects an incomplete Community user on a protected route to the shared brand step', async () => {
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/default/workspace'),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboarding/brand',
      );
    });

    it('lets a Community user stay on agent onboarding after the shared brand step', async () => {
      mockIncompleteUser([{ isActive: true, slug: 'acme' }], ['brand']);

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/~/agent/onboarding'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });

    it.each(['/onboarding', '/onboarding/brand'])(
      'keeps the shared brand entry %s reachable for a signed-in Community user',
      async (pathname) => {
        mockIncompleteUser();

        const { default: proxy } = await import('./proxy');
        const response = await proxy(
          makeSignedInRequest(pathname),
          {} as never,
        );

        expect(response.headers.get('location')).toBeNull();
      },
    );

    it.each(['/onboarding/providers', '/onboarding/summary'])(
      'does not bounce a signed-in user to brand setup when bootstrap cannot be read from %s',
      async (pathname) => {
        fetchMock.mockImplementation(async (input: string | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/token')) {
            return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
              status: 200,
            });
          }
          if (url.endsWith('/auth/bootstrap')) {
            return new Response('error', { status: 500 });
          }
          return new Response('not found', { status: 404 });
        });

        const { default: proxy } = await import('./proxy');
        const response = await proxy(
          makeSignedInRequest(pathname),
          {} as never,
        );

        expect(response.headers.get('location')).toBeNull();
      },
    );

    it.each(['/onboarding/providers', '/onboarding/summary'])(
      'pulls a signed-in Community user off the classic wizard route %s',
      async (pathname) => {
        mockIncompleteUser();

        const { default: proxy } = await import('./proxy');
        const response = await proxy(
          makeSignedInRequest(pathname),
          {} as never,
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
          'http://localhost:3000/onboarding/brand',
        );
      },
    );

    it.each(['/onboarding/post-signup', '/onboarding/proactive'])(
      'keeps the mode-agnostic wizard route %s reachable for a signed-in Community user',
      async (pathname) => {
        mockIncompleteUser();

        const { default: proxy } = await import('./proxy');
        const response = await proxy(
          makeSignedInRequest(pathname),
          {} as never,
        );

        expect(response.headers.get('location')).toBeNull();
      },
    );

    it('leaves signed-out visitors on the classic wizard route untouched', async () => {
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedOutRequest('/onboarding/brand'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renders the classic wizard for the desktop client on a self-hosted install', async () => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/onboarding/brand'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });

    it('does not route self-hosted desktop users into web agent onboarding', async () => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/default/workspace'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });

    it('renders the classic wizard when the Community workspace slug cannot be resolved', async () => {
      mockIncompleteUser([]);

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/onboarding/brand'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });

    it('does not consult a runtime flag before opening SaaS agent onboarding', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/default/workspace'),
        {} as never,
      );

      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboarding/brand',
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/feature-flags/'),
        expect.anything(),
      );
    });

    it('sends incomplete SaaS users to brand setup while organization provisioning is pending', async () => {
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser([]);

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/settings'),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboarding/brand',
      );
    });

    it('does not route cloud-connected desktop users into web agent onboarding', async () => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
      mockIncompleteUser();

      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeSignedInRequest('/acme/default/workspace'),
        {} as never,
      );

      expect(response.headers.get('location')).toBeNull();
    });
  });

  it('redirects completed users with a seeded brand to workspace overview', async () => {
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
            access: { brandId: 'brand_1', isOnboardingCompleted: true },
            brands: [{ id: 'brand_1', slug: 'default' }],
            currentUser: {
              id: 'user_1',
              isOnboardingCompleted: true,
              onboardingStepsCompleted: [],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations?mine=true')) {
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
      'http://localhost:3000/acme/default/workspace/overview',
    );
  });

  it('redirects signed-in root using the available brand when none is selected', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
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

  it('refreshes a brandless workspace cookie before redirecting root', async () => {
    vi.stubEnv('COOKIE_SECRET', 'test-secret-at-least-32-chars-long!!');
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');
    const orgScopedResponse = await proxy(
      makeSignedInRequest('/settings/members'),
      {} as never,
    );
    const cookieValue = (orgScopedResponse.headers.get('set-cookie') ?? '')
      .match(/gf_ws=([^;]+)/)
      ?.at(1);

    expect(cookieValue).toBeTruthy();

    const response = await proxy(
      makeSignedInRequest('/', {
        extraCookies: { gf_ws: cookieValue ?? '' },
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  // No brand yet: send signed-in root to the shared brand step instead of
  // holding them on `/` or bouncing them into the providers wizard.
  it('sends signed-in root to brand setup when no workspace slug resolves yet', async () => {
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

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding/brand',
    );
  });

  it('redirects signed-in root using the active brand when multiple brands exist', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
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

  it('redirects unauthenticated root to login without a redundant callbackUrl', async () => {
    // Root `/` is already the login flow's default callback, so the bounce
    // must not append a noisy `callbackUrl=/` param (Finding #25 guard).
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedOutRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('redirects keyless self-hosted protected entrypoints to the seeded workspace', async () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
    delete process.env.BETTER_AUTH_SECRET;

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    for (const pathname of ['/settings', '/workspace']) {
      const response = await proxy(makeSignedOutRequest(pathname), {} as never);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/default/default/workspace/overview',
      );
    }
  });

  it('redirects signed-in flat protected routes to the canonical org and brand path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it.each([
    [
      '/acme/moonrise-studio/workspace/tasks',
      '/acme/moonrise-studio/workspace/tasks',
    ],
    [
      '/acme/moonrise-studio/workspace/tasks/GEN-42',
      '/acme/moonrise-studio/workspace/tasks/GEN-42',
    ],
  ])('preserves canonical scoped task route %s', async (pathname) => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest(pathname, { search: '?view=kanban' }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('scopes the canonical flat tasks route', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace/tasks', { search: '?view=kanban' }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/tasks?view=kanban',
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const postsResponse = await proxy(
      makeSignedInRequest('/publishing'),
      {} as never,
    );

    expect(postsResponse.status).toBe(307);
    expect(postsResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/publishing',
    );

    const workspaceResponse = await proxy(
      makeSignedInRequest('/workspace'),
      {} as never,
    );

    expect(workspaceResponse.status).toBe(307);
    expect(workspaceResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/workspace/overview',
    );
  });

  it('collapses flat automation routes onto the org Automation overview when no brand is selected', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const rootResponse = await proxy(
      makeSignedInRequest('/automation'),
      {} as never,
    );

    expect(rootResponse.status).toBe(307);
    expect(rootResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/automation',
    );

    const workflowsResponse = await proxy(
      makeSignedInRequest('/automation/workflows'),
      {} as never,
    );

    expect(workflowsResponse.status).toBe(307);
    expect(workflowsResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/automation',
    );
  });

  it('keeps flat discovery routes on their org surface when no brand is selected', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    // `/~/discovery` mirrors the brand tree in full, so a brandless org keeps the
    // requested surface instead of collapsing onto the org overview.
    const adsResponse = await proxy(
      makeSignedInRequest('/discovery/ads'),
      {} as never,
    );

    expect(adsResponse.status).toBe(307);
    expect(adsResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/discovery/ads',
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const personalHome = await proxy(
      makeSignedInRequest('/settings/personal'),
      {} as never,
    );
    const notifications = await proxy(
      makeSignedInRequest('/settings/notifications'),
      {} as never,
    );

    expect(personalHome.status).toBe(200);
    expect(personalHome.headers.get('location')).toBeNull();
    expect(notifications.status).toBe(200);
    expect(notifications.headers.get('location')).toBeNull();
  });

  it('redirects signed-in bare protected routes to agent onboarding when no projects exist', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding/brand',
    );
  });

  it('redirects scoped app routes to agent onboarding when no projects exist', async () => {
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

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/~/workspace/overview'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/onboarding/brand',
    );
  });

  it('redirects brand-scoped routes to agent onboarding while onboarding is incomplete', async () => {
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
            access: { brandId: 'brand_1', isOnboardingCompleted: false },
            brands: [{ id: 'brand_1', slug: 'moonrise-studio' }],
            currentUser: {
              id: 'user_1',
              isOnboardingCompleted: false,
              onboardingStepsCompleted: ['brand'],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/publishing'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/agent/onboarding',
    );
  });

  it('redirects signed-in flat agent to the canonical brand-scoped agent path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedInRequest('/agent'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/agent',
    );
  });

  it('resolves signed-in root from authenticated access instead of a stale scoped referrer', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/', {
        referer: 'http://localhost:3000/default/default/agent',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('recovers signed-in root from a stale workspace cache and signed cookie', async () => {
    vi.stubEnv('COOKIE_SECRET', 'test-secret-at-least-32-chars-long!!');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const staleResponse = await proxy(
      makeSignedInRequest('/default/default/agent'),
      {} as never,
    );
    const staleCookie = (staleResponse.headers.get('set-cookie') ?? '')
      .match(/gf_ws=([^;]+)/)
      ?.at(1);
    expect(staleCookie).toBeTruthy();

    fetchMock.mockClear();
    const recoveredResponse = await proxy(
      makeSignedInRequest('/', {
        extraCookies: { gf_ws: staleCookie ?? '' },
      }),
      {} as never,
    );

    expect(recoveredResponse.status).toBe(307);
    expect(recoveredResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/organizations?mine=true'),
      ),
    ).toBe(true);
  });

  it('brand-scopes /library/assets from the referer without leaving the page', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/library/assets', {
        referer: 'http://localhost:3000/demo/FUDNEWS/library/images',
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/demo/FUDNEWS/library/assets',
    );
  });

  it('writes the URL brand into gf_ws so a later unscoped hop stays on FUD News', async () => {
    vi.stubEnv('COOKIE_SECRET', 'test-secret-at-least-32-chars-long!!');
    const { default: proxy } = await import('./proxy');

    const scopedResponse = await proxy(
      makeSignedInRequest('/demo/FUDNEWS/library/images'),
      {} as never,
    );

    expect(scopedResponse.headers.get('location')).toBeNull();
    const cookieValue = (scopedResponse.headers.get('set-cookie') ?? '')
      .match(/gf_ws=([^;]+)/)
      ?.at(1);
    expect(cookieValue).toBeTruthy();

    const unscopedResponse = await proxy(
      makeSignedInRequest('/library/assets', {
        extraCookies: { gf_ws: cookieValue ?? '' },
      }),
      {} as never,
    );

    expect(unscopedResponse.status).toBe(307);
    expect(unscopedResponse.headers.get('location')).toBe(
      'http://localhost:3000/demo/FUDNEWS/library/assets',
    );
  });

  it('skips network auth bootstrap for a scoped RSC transition from the mounted app shell', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/agent/next-thread', {
        referer: 'http://localhost:3000/acme/moonrise-studio/agent/thread-1',
        rsc: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the scoped next-url header when the RSC fetch omits its referer', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/agent/next-thread', {
        nextUrl: '/acme/moonrise-studio/agent/thread-1',
        rsc: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an absolute next-url as proof of a mounted app shell', async () => {
    const { default: proxy } = await import('./proxy');

    await proxy(
      makeSignedInRequest('/acme/moonrise-studio/agent/next-thread', {
        nextUrl: 'https://attacker.example/acme/moonrise-studio/agent/thread-1',
        rsc: true,
      }),
      {} as never,
    );

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/token',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/bootstrap',
    );
  });

  it('keeps strict auth bootstrap for a scoped RSC request without a mounted scoped shell', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/agent/next-thread', {
        rsc: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/token',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/bootstrap',
    );
  });

  it('keeps strict auth bootstrap for server actions from a scoped page', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/acme/moonrise-studio/agent/next-thread', {
        method: 'POST',
        nextAction: 'action-id',
        referer: 'http://localhost:3000/acme/moonrise-studio/agent/thread-1',
        rsc: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/token',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'http://localhost:3010/v1/auth/bootstrap',
    );
  });

  it('redirects signed-in flat agent to org scope when no brand exists', async () => {
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
            brands: [],
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/organizations?mine=true')) {
        return new Response(
          JSON.stringify([{ isActive: true, slug: 'acme' }]),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

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

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/settings/personal',
    );
  });

  describe.each([
    {
      desktopToken: 'gf_valid_desktop_token',
      hasSession: true,
      label: 'valid desktop key and valid Better Auth cookie',
    },
    {
      desktopToken: 'gf_valid_desktop_token',
      hasSession: false,
      label: 'valid desktop key and no Better Auth cookie',
    },
    {
      desktopToken: undefined,
      hasSession: true,
      label: 'no desktop key and valid Better Auth cookie',
    },
    {
      desktopToken: undefined,
      hasSession: false,
      label: 'no desktop key and no Better Auth cookie',
    },
  ])('desktop credential matrix: $label', ({ desktopToken, hasSession }) => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
      vi.resetModules();
    });

    it('routes a protected entrypoint using the session as authority', async () => {
      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeDesktopRequest('/workspace', { desktopToken, hasSession }),
        {} as never,
      );

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');

      if (hasSession) {
        expect(location.pathname).toBe(
          '/acme/moonrise-studio/workspace/overview',
        );
      } else {
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('callbackUrl')).toBe('/workspace');
      }

      const didExchangeSessionCookie = fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/token'),
      );
      expect(didExchangeSessionCookie).toBe(hasSession && !desktopToken);
    });

    it('renders or leaves login according to the Better Auth session', async () => {
      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeDesktopRequest('/login', { desktopToken, hasSession }),
        {} as never,
      );

      if (hasSession) {
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
          'http://localhost:3000/acme/moonrise-studio/workspace/overview',
        );
      } else {
        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      }
    });

    it('keeps logout reachable and clears the desktop slug cookie', async () => {
      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeDesktopRequest('/logout', { desktopToken, hasSession }),
        {} as never,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      const setCookieHeader = response.headers.get('set-cookie') ?? '';
      expect(setCookieHeader).toContain('gf_ws');
      expect(setCookieHeader).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
    });

    it('routes root using the session as authority', async () => {
      const { default: proxy } = await import('./proxy');
      const response = await proxy(
        makeDesktopRequest('/', { desktopToken, hasSession }),
        {} as never,
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        hasSession
          ? 'http://localhost:3000/acme/moonrise-studio/workspace/overview'
          : 'http://localhost:3000/login',
      );
    });
  });

  it('recognizes a remote desktop request without a desktop build flag', async () => {
    const { default: proxy } = await import('./proxy');
    const response = await proxy(
      makeDesktopRequest('/workspace', {
        desktopToken: 'gf_valid_desktop_token',
        hasSession: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('requires remote desktop clients to satisfy the configured minimum version', async () => {
    vi.stubEnv('GENFEED_DESKTOP_MINIMUM_VERSION', '0.2.0');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/', {
        desktopVersion: '0.1.9',
        hasSession: false,
      }),
      {} as never,
    );

    expect(response.status).toBe(426);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-genfeed-desktop-minimum-version')).toBe(
      '0.2.0',
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: 'DESKTOP_UPDATE_REQUIRED',
        currentVersion: '0.1.9',
        minimumVersion: '0.2.0',
      }),
    );
  });

  it('rejects malformed desktop versions instead of bypassing the gate', async () => {
    const { default: proxy } = await import('./proxy');
    const response = await proxy(
      makeDesktopRequest('/', {
        desktopVersion: 'not-a-version',
        hasSession: false,
      }),
      {} as never,
    );

    expect(response.status).toBe(426);
  });

  it('keeps the shared desktop brand step reachable without a cloud session', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/onboarding/brand', { hasSession: false }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects signed-out desktop summary onboarding to the desktop login surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/onboarding/summary', { hasSession: false }),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe(
      '/onboarding/summary',
    );
  });

  it('lets unsigned desktop local onboarding reach provider CLI checks', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/onboarding/providers', { hasSession: false }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps the explicit desktop local surface reachable without a cloud session', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/desktop/local', { hasSession: false }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not expose similarly prefixed desktop routes without a cloud session', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/desktop/local-preview', { hasSession: false }),
      {} as never,
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    // `/desktop` is a reserved root segment and only `/desktop/local[/…]` is an
    // allowed continuation, so a look-alike path is gated *and* refused as a
    // post-login destination rather than being pinned as a callback.
    expect(location.searchParams.get('callbackUrl')).toBeNull();
  });

  it('lets signed-in desktop onboarding render', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/onboarding/brand', { hasSession: true }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not fetch bootstrap to decide onboarding redirects on a signed-in desktop protected path', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/acme/~/agent', { hasSession: true }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/bootstrap'),
      ),
    ).toBe(false);
  });

  it('falls back to the Better Auth bearer when the desktop key is stale', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    fetchMock.mockImplementation(
      async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = init?.headers as Record<string, string> | undefined;

        if (url.endsWith('/auth/token')) {
          return new Response(JSON.stringify({ token: BEARER_TOKEN }), {
            status: 200,
          });
        }

        if (headers?.Authorization === 'Bearer stale_desktop_token') {
          return new Response('unauthorized', { status: 401 });
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

        if (url.endsWith('/organizations?mine=true')) {
          return new Response(
            JSON.stringify([{ isActive: true, slug: 'acme' }]),
            { status: 200 },
          );
        }

        return new Response('not found', { status: 404 });
      },
    );
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeDesktopRequest('/', {
        desktopToken: 'stale_desktop_token',
        hasSession: true,
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/token'),
      ),
    ).toBe(true);
  });

  it('does not preserve legacy org settings detail routes as a compatibility layer', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/settings/organization/members'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/~/settings/organization/members',
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
      makeSignedInRequest('/workspace'),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/organizations?mine=true'),
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
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe(
      '/settings/organization/members',
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

  it('redirects the keyless self-hosted root to the seeded workspace overview', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_ENABLED', 'false');
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);

    vi.resetModules();
    const { default: proxy } = await import('./proxy');
    const response = await proxy(makeSignedOutRequest('/'), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/default/default/workspace/overview',
    );
  });

  it('skips API call when valid slug cookie is present', async () => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long!!';

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const firstResponse = await proxy(
      makeSignedInRequest('/workspace'),
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
      makeSignedInRequest('/publishing', {
        extraCookies: { gf_ws: cookieValue ?? '' },
      }),
      {} as never,
    );

    expect(secondResponse.status).toBe(307);
    expect(secondResponse.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/publishing',
    );
    // The slug cookie caches org/brand slugs, but bootstrap is still required
    // so the onboarding gate can inspect completed steps before routing.
    // The expensive org resolution fetch must stay skipped.
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/bootstrap'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/organizations?mine=true'),
      ),
    ).toBe(false);

    delete process.env.COOKIE_SECRET;
  });

  it('falls back to API when cookie is expired or tampered', async () => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long!!';

    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace', {
        extraCookies: { gf_ws: 'tampered.cookie' },
      }),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(fetchMock).toHaveBeenCalled();

    delete process.env.COOKIE_SECRET;
  });

  it('reads the bootstrap once per protected request', async () => {
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      makeSignedInRequest('/workspace'),
      {} as never,
    );

    expect(response.status).toBe(307);
    // The onboarding gate and workspace-slug resolution both need the same
    // payload. A visitor with no slug cookie waits on that round trip before
    // the redirect is issued, so it happens once, not once per consumer.
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/auth/bootstrap'),
      ),
    ).toHaveLength(1);
  });

  it('deletes slug cookie on logout', async () => {
    vi.resetModules();
    const { default: proxy } = await import('./proxy');

    const response = await proxy(makeSignedOutRequest('/logout'), {} as never);

    const setCookieHeader = response.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain('gf_ws');
    expect(setCookieHeader).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });
});
