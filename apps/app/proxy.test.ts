import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const authStateMock = vi.fn();
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (
    handler: (
      auth: () => Promise<unknown>,
      req: Record<string, unknown>,
      event: unknown,
    ) => Promise<Response>,
  ) => {
    return (req: Record<string, unknown>, event: unknown) =>
      handler(async () => await authStateMock(), req, event);
  },
  createRouteMatcher:
    (patterns: string[]) => (req: { nextUrl: { pathname: string } }) => {
      const pathname = req.nextUrl.pathname;
      return patterns.some((pattern) => {
        const normalized = pattern.replace('(.*)', '');
        if (normalized === '/') {
          return pathname === '/';
        }
        return pathname === normalized || pathname.startsWith(normalized);
      });
    },
}));

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.NEXT_PUBLIC_API_ENDPOINT = 'http://localhost:3010/v1';
    authStateMock.mockResolvedValue({
      getToken: vi.fn().mockResolvedValue('token_1'),
      sessionId: 'session_1',
      userId: 'user_1',
    });
    globalThis.fetch = fetchMock as typeof fetch;
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

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

  it('redirects signed-in users away from public routes', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/login' },
        url: 'http://localhost:3000/login',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('redirects signed-in root to workspace when single brand', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('redirects signed-in root to active brand workspace when multiple brands', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

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

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('falls through on root when slug resolution fails', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response('error', { status: 500 });
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
  });

  it('falls through on root when slug resolution fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
  });

  it('redirects unauthenticated root to login', async () => {
    authStateMock.mockResolvedValue({
      getToken: vi.fn().mockResolvedValue(null),
      sessionId: null,
      userId: null,
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/' },
        url: 'http://localhost:3000/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('redirects signed-in flat protected routes to the canonical org and brand path', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/workspace/overview', search: '' },
        url: 'http://localhost:3000/workspace/overview',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/acme/moonrise-studio/workspace/overview',
    );
  });

  it('uses the bootstrap organization slug without fetching organizations', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

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
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/workspace/overview', search: '' },
        url: 'http://localhost:3000/workspace/overview',
      } as never,
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

  it('redirects signed-out protected routes to login instead of invoking Clerk dev handshake', async () => {
    authStateMock.mockResolvedValue({
      getToken: vi.fn().mockResolvedValue(null),
      sessionId: null,
      userId: null,
    });

    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/settings/organization/members', search: '' },
        url: 'http://localhost:3000/settings/organization/members',
      } as never,
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

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/login' },
        url: 'http://localhost:3000/login',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
  });

  it('canonicalizes bare protected routes in desktop shell mode when a desktop token is present', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

    const { default: proxy } = await import(
      `./proxy?desktop-shell=${Date.now()}`
    );

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
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    process.env.CLERK_SECRET_KEY = 'sk_test';
  });

  it('redirects desktop shell root to login when the injected desktop token is stale', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    fetchMock.mockImplementation(
      async () => new Response('error', { status: 500 }),
    );

    const { default: proxy } = await import(
      `./proxy?desktop-shell-stale-root=${Date.now()}`
    );

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
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    process.env.CLERK_SECRET_KEY = 'sk_test';
  });

  it('lets desktop shell login render when the injected desktop token is stale', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    fetchMock.mockImplementation(
      async () => new Response('error', { status: 500 }),
    );

    const { default: proxy } = await import(
      `./proxy?desktop-shell-stale-login=${Date.now()}`
    );

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
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    process.env.CLERK_SECRET_KEY = 'sk_test';
  });
});
