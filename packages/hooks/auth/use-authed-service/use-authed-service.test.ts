import { resolveAuthToken } from '@helpers/auth/auth.helper';
import {
  clearTokenCache,
  useAuthedService,
} from '@hooks/auth/use-authed-service/use-authed-service';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuthIdentity = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(),
}));

describe('useAuthedService', () => {
  const getTokenMock = vi.fn();
  const mockResolveAuthToken = resolveAuthToken as unknown as ReturnType<
    typeof vi.fn
  >;
  let orgIdMock: string | null = 'org-123';
  let sessionIdMock: string | null = 'session-123';
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
    sessionIdMock = 'session-123';
    userIdMock = 'user-123';
    mockResolveAuthToken.mockImplementation(async (getToken, opts) =>
      getToken(opts),
    );
    mockUseAuthIdentity.mockReturnValue({
      getToken: getTokenMock,
      orgId: orgIdMock,
      sessionId: sessionIdMock,
      userId: userIdMock,
    });
  });

  it('returns service instance with auth token', () => {
    const mockService = vi.fn();
    const { result } = renderHook(() => useAuthedService(mockService));
    expect(result.current).toBeDefined();
  });

  it('uses the standard session token when no template is provided', async () => {
    const mockService = vi.fn();
    getTokenMock.mockResolvedValue('jwt-token');

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();

    expect(getTokenMock).toHaveBeenCalledWith(undefined);
    expect(mockService).toHaveBeenCalledWith('jwt-token');
  });

  it('uses an explicit token template when provided', async () => {
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

  it('falls back to the playwright jwt token when the session token is null', async () => {
    const mockService = vi.fn();
    mockResolveAuthToken.mockResolvedValue('playwright-jwt');

    const { result } = renderHook(() => useAuthedService(mockService));

    await result.current();

    expect(resolveAuthToken).toHaveBeenCalledWith(getTokenMock, undefined);
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
    mockUseAuthIdentity.mockReturnValue({
      getToken: getTokenMock,
      orgId: orgIdMock,
      sessionId: sessionIdMock,
      userId: userIdMock,
    });

    rerender();
    await result.current();

    expect(getTokenMock).toHaveBeenCalledTimes(2);
    expect(mockService).toHaveBeenNthCalledWith(1, 'jwt-token-user-1');
    expect(mockService).toHaveBeenNthCalledWith(2, 'jwt-token-user-2');
  });

  it('does not reuse a cached token across session rotations', async () => {
    const mockService = vi.fn();
    getTokenMock
      .mockResolvedValueOnce('jwt-token-session-1')
      .mockResolvedValueOnce('jwt-token-session-2');

    const { result, rerender } = renderHook(() =>
      useAuthedService(mockService),
    );

    await result.current();

    sessionIdMock = 'session-456';
    mockUseAuthIdentity.mockReturnValue({
      getToken: getTokenMock,
      orgId: orgIdMock,
      sessionId: sessionIdMock,
      userId: userIdMock,
    });

    rerender();
    await result.current();

    expect(getTokenMock).toHaveBeenCalledTimes(2);
    expect(mockService).toHaveBeenNthCalledWith(1, 'jwt-token-session-1');
    expect(mockService).toHaveBeenNthCalledWith(2, 'jwt-token-session-2');
  });
});
