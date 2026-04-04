import { beforeEach, describe, expect, it, vi } from 'vitest';

const authStateMock = vi.fn();
const protectMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (
    handler: (
      auth: (() => Promise<unknown>) & { protect: typeof protectMock },
      req: Record<string, unknown>,
      event: unknown,
    ) => Promise<Response>,
  ) => {
    return (req: Record<string, unknown>, event: unknown) =>
      handler(
        Object.assign(async () => await authStateMock(), {
          protect: protectMock,
        }),
        req,
        event,
      );
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

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      website: 'https://genfeed.ai',
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('admin proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateMock.mockResolvedValue({
      sessionClaims: {
        metadata: {
          publicMetadata: {
            isSuperAdmin: true,
          },
        },
      },
      sessionId: 'session_1',
      userId: 'user_1',
    });
    protectMock.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL =
      '/overview/dashboard';
  });

  it('redirects signed-in users on public routes to the admin home', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        nextUrl: { pathname: '/' },
        url: 'https://admin.genfeed.ai/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://admin.genfeed.ai/overview/dashboard',
    );
  });

  it('does not self-redirect when the configured target matches the current route', async () => {
    const { default: proxy } = await import('./proxy');
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL = '/';

    const response = await proxy(
      {
        nextUrl: { pathname: '/' },
        url: 'https://admin.genfeed.ai/',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
  });

  it('redirects unauthenticated protected requests to login', async () => {
    const { default: proxy } = await import('./proxy');
    authStateMock.mockResolvedValue({
      sessionClaims: null,
      sessionId: null,
      userId: null,
    });

    const response = await proxy(
      {
        nextUrl: { pathname: '/administration/users' },
        url: 'https://admin.genfeed.ai/administration/users',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://admin.genfeed.ai/login',
    );
  });

  it('redirects signed-in non-admin users away from admin routes', async () => {
    const { default: proxy } = await import('./proxy');
    authStateMock.mockResolvedValue({
      sessionClaims: {
        metadata: {
          publicMetadata: {
            isSuperAdmin: false,
          },
        },
      },
      sessionId: 'session_1',
      userId: 'user_1',
    });

    const response = await proxy(
      {
        nextUrl: { pathname: '/administration/users' },
        url: 'https://admin.genfeed.ai/administration/users',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://genfeed.ai/');
  });

  it('allows signed-in admins through protected routes from session claims alone', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        nextUrl: { pathname: '/administration/users' },
        url: 'https://admin.genfeed.ai/administration/users',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
  });

  it('skips Clerk middleware for Playwright bypass requests in development', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: {
          get: (name: string) =>
            name === '__playwright_test' ? { value: 'true' } : undefined,
        },
        nextUrl: { pathname: '/overview' },
        url: 'http://localhost:3101/overview',
      } as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(authStateMock).not.toHaveBeenCalled();
  });
});
