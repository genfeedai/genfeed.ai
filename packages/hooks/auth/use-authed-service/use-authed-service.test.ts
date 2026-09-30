import {
  resolveAuthToken,
  resolveRequiredAuthToken,
} from '@helpers/auth/auth.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuthIdentity = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(),
  resolveRequiredAuthToken: vi.fn(),
}));

describe('useAuthedService', () => {
  const getTokenMock = vi.fn();
  const mockResolveAuthToken = resolveAuthToken as unknown as ReturnType<
    typeof vi.fn
  >;
  const mockResolveRequiredAuthToken =
    resolveRequiredAuthToken as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockImplementation(async (getToken, opts) =>
      getToken(opts),
    );
    mockResolveRequiredAuthToken.mockImplementation(
      async (getToken, opts, createError) => {
        const token = await mockResolveAuthToken(getToken, opts);
        if (!token) {
          throw createError();
        }
        return token;
      },
    );
    mockUseAuthIdentity.mockReturnValue({
      getToken: getTokenMock,
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
});
