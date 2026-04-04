import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import {
  clearTokenCache,
  useAuthedService,
} from '@hooks/auth/use-authed-service/use-authed-service';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn() })),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: vi.fn(),
}));

describe('useAuthedService', () => {
  const getTokenMock = vi.fn();
  const mockResolveClerkToken = resolveClerkToken as unknown as ReturnType<
    typeof vi.fn
  >;
  const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
  let orgIdMock: string | null = 'org-123';
  let userIdMock: string | null = 'user-123';

  function createJwt(exp: number): string {
    const encode = (value: object): string =>
      btoa(JSON.stringify(value))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.signature`;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clearTokenCache();
    orgIdMock = 'org-123';
    userIdMock = 'user-123';
    mockResolveClerkToken.mockImplementation(async (getToken, opts) =>
      getToken(opts),
    );
    mockUseAuth.mockReturnValue({
      getToken: getTokenMock,
      orgId: orgIdMock,
      userId: userIdMock,
    } as ReturnType<typeof useAuth>);
  });

  it('returns service instance with auth token', () => {
    const mockService = vi.fn();
    const { result } = renderHook(() => useAuthedService(mockService));
    expect(result.current).toBeDefined();
  });

  it('uses the standard Clerk session token when no template is provided', async () => {
    const mockService = vi.fn();
    getTokenMock.mockResolvedValue('jwt-token');

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();

    expect(getTokenMock).toHaveBeenCalledWith(undefined);
    expect(mockService).toHaveBeenCalledWith('jwt-token');
  });

  it('uses an explicit Clerk token template when provided', async () => {
    const mockService = vi.fn();
    getTokenMock.mockResolvedValue('template-token');

    const { result } = renderHook(() =>
      useAuthedService(mockService, 'genfeed-jwt'),
    );

    await result.current();

    expect(getTokenMock).toHaveBeenCalledWith({ template: 'genfeed-jwt' });
    expect(mockService).toHaveBeenCalledWith('template-token');
  });

  it('does not cache an empty token result', async () => {
    const mockService = vi.fn();
    getTokenMock.mockResolvedValueOnce(null).mockResolvedValueOnce('jwt-token');

    const { result } = renderHook(() => useAuthedService(mockService));

    await expect(result.current()).rejects.toThrow(
      'Authentication token unavailable',
    );
    await result.current();

    expect(getTokenMock).toHaveBeenCalledTimes(2);
    expect(mockService).toHaveBeenCalledTimes(1);
    expect(mockService).toHaveBeenNthCalledWith(1, 'jwt-token');
  });

  it('falls back to the playwright jwt token when Clerk returns null', async () => {
    const mockService = vi.fn();
    mockResolveClerkToken.mockResolvedValue('playwright-jwt');

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();

    expect(resolveClerkToken).toHaveBeenCalledWith(getTokenMock, undefined);
    expect(mockService).toHaveBeenCalledWith('playwright-jwt');
  });

  it('does not reuse a token that is already near expiry', async () => {
    const mockService = vi.fn();
    const nearExpiryToken = createJwt(Math.floor(Date.now() / 1000) + 1);
    const refreshedToken = createJwt(Math.floor(Date.now() / 1000) + 120);

    getTokenMock
      .mockResolvedValueOnce(nearExpiryToken)
      .mockResolvedValueOnce(refreshedToken);

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();
    await result.current();

    expect(getTokenMock).toHaveBeenCalledTimes(2);
    expect(mockService).toHaveBeenNthCalledWith(1, nearExpiryToken);
    expect(mockService).toHaveBeenNthCalledWith(2, refreshedToken);
  });

  it('supports forcing a fresh token lookup', async () => {
    const mockService = vi.fn();
    getTokenMock
      .mockResolvedValueOnce('cached-token')
      .mockResolvedValueOnce('fresh-token');

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();
    await result.current({ forceRefresh: true });

    expect(getTokenMock).toHaveBeenNthCalledWith(1, undefined);
    expect(getTokenMock).toHaveBeenNthCalledWith(2, {
      forceRefresh: true,
      template: undefined,
    });
    expect(mockService).toHaveBeenNthCalledWith(2, 'fresh-token');
  });

  it('does not reuse a cached token across auth identity changes', async () => {
    const mockService = vi.fn();
    getTokenMock
      .mockResolvedValueOnce('jwt-token-user-1')
      .mockResolvedValueOnce('jwt-token-user-2');

    const { result, rerender } = renderHook(() =>
      useAuthedService(mockService),
    );

    await result.current();

    userIdMock = 'user-456';
    mockUseAuth.mockReturnValue({
      getToken: getTokenMock,
      orgId: orgIdMock,
      userId: userIdMock,
    } as ReturnType<typeof useAuth>);

    rerender();
    await result.current();

    expect(getTokenMock).toHaveBeenCalledTimes(2);
    expect(mockService).toHaveBeenNthCalledWith(1, 'jwt-token-user-1');
    expect(mockService).toHaveBeenNthCalledWith(2, 'jwt-token-user-2');
  });
});
