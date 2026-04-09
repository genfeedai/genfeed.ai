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

  it('allows the root route through without invoking Clerk protect', async () => {
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
});
