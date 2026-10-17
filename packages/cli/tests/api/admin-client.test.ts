import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminGet,
  adminPost,
  clearAdminTokenCache,
  revokeAdminSession,
} from '../../src/api/admin-client';
import { ApiError, GenfeedError } from '../../src/utils/errors';

const { mockFetch, mockGetAdminSession } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetAdminSession: vi.fn(),
}));

vi.mock('../../src/config/store', () => ({
  getAdminSession: () => mockGetAdminSession(),
  getApiUrl: async () => 'https://api.genfeed.ai/v1',
}));

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

function jwt(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `header.${payload}.signature`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('api/admin-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAdminTokenCache();
    vi.stubGlobal('fetch', mockFetch);
    mockGetAdminSession.mockResolvedValue({
      cookieName: 'better-auth.session_token',
      cookieValue: 'session-value',
      expiresAt: FUTURE,
    });
  });

  it('mints a JWT from the session cookie and sends only the bearer to the admin route', async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 900);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'a' } }));

    await expect(adminGet('/admin/model-pricing')).resolves.toEqual({ data: { id: 'a' } });

    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0];
    expect(tokenUrl).toBe('https://api.genfeed.ai/v1/auth/token');
    expect(tokenInit.headers.Cookie).toBe('better-auth.session_token=session-value');

    const [routeUrl, routeInit] = mockFetch.mock.calls[1];
    expect(routeUrl).toBe('https://api.genfeed.ai/v1/admin/model-pricing');
    expect(routeInit.headers.Authorization).toBe(`Bearer ${token}`);
    expect(routeInit.headers.Cookie).toBeUndefined();
  });

  it('reuses an unexpired JWT across calls', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: jwt(Math.floor(Date.now() / 1000) + 900) }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));

    await adminGet('/admin/system-brand');
    await adminPost('/admin/model-pricing/m1/approve-rates', { expectedPendingVersion: 'v1' });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(
      mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/token'))
    ).toHaveLength(1);
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ expectedPendingVersion: 'v1' });
  });

  it('asks for a login when no session is stored', async () => {
    mockGetAdminSession.mockResolvedValue(undefined);

    await expect(adminGet('/admin/system-brand')).rejects.toThrow(GenfeedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses an expired session without calling the API', async () => {
    mockGetAdminSession.mockResolvedValue({
      cookieName: 'c',
      cookieValue: 'v',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(adminGet('/admin/system-brand')).rejects.toThrow('Admin session expired');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a revoked session when the token endpoint answers 401', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(adminGet('/admin/system-brand')).rejects.toThrow('no longer valid');
  });

  it('explains a 403 from an admin route', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: jwt(Math.floor(Date.now() / 1000) + 900) }))
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Admin access is restricted to allowlisted IPs' }, 403)
      );

    const error = await adminGet('/admin/model-pricing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('allowlisted IPs');
    expect((error as ApiError).suggestion).toContain('ADMIN_ALLOWED_IPS');
  });

  it('reports whether the server revoked the session', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: true }));
    await expect(revokeAdminSession('https://api.genfeed.ai/v1', 'c=v')).resolves.toBe(true);

    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(revokeAdminSession('https://api.genfeed.ai/v1', 'c=v')).resolves.toBe(false);
  });
});
