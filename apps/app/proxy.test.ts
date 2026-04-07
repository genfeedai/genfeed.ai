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
        return pathname === normalized || pathname.startsWith(normalized);
      });
    },
}));

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    process.env.CLERK_SECRET_KEY = 'sk_test';
    authStateMock.mockResolvedValue({
      sessionId: 'session_1',
      userId: 'user_1',
    });
    protectMock.mockResolvedValue(undefined);
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
      'http://localhost:3000/workspace/overview',
    );
  });

  it('protects private routes and does not apply business gating', async () => {
    const { default: proxy } = await import('./proxy');

    const response = await proxy(
      {
        cookies: { get: vi.fn() },
        nextUrl: { pathname: '/settings/organization/members' },
        url: 'http://localhost:3000/settings/organization/members',
      } as never,
      {} as never,
    );

    expect(protectMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
