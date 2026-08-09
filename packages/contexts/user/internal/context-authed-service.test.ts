// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextAuthenticationTokenUnavailableError,
  useContextAuthedService,
} from './context-authed-service';

const useAuthIdentityMock = vi.fn();

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthIdentityMock(),
}));

interface FakeService {
  token: string;
}

describe('useContextAuthedService', () => {
  const getTokenMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthIdentityMock.mockReturnValue({
      getToken: getTokenMock,
      orgId: 'org_1',
      sessionId: 'session_1',
      userId: 'user_1',
    });
    getTokenMock.mockResolvedValue('token-123');
  });

  it('builds the service with the resolved token', async () => {
    const factory = vi.fn(
      (token: string): FakeService => ({
        token,
      }),
    );
    const { result } = renderHook(() => useContextAuthedService(factory));

    const service = await result.current();

    expect(service).toEqual({ token: 'token-123' });
    expect(factory).toHaveBeenCalledWith('token-123');
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  it('passes forceRefresh and template options through to getToken', async () => {
    const factory = (token: string): FakeService => ({ token });
    const { result } = renderHook(() =>
      useContextAuthedService(factory, 'backend'),
    );

    await result.current({ forceRefresh: true });

    expect(getTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true, template: 'backend' }),
    );
  });

  it('throws ContextAuthenticationTokenUnavailableError when no token resolves', async () => {
    getTokenMock.mockResolvedValue(null);
    const factory = vi.fn((token: string): FakeService => ({ token }));
    const { result } = renderHook(() => useContextAuthedService(factory));

    await expect(result.current()).rejects.toBeInstanceOf(
      ContextAuthenticationTokenUnavailableError,
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('uses the latest factory after a rerender', async () => {
    const firstFactory = (token: string): FakeService => ({
      token: `first-${token}`,
    });
    const secondFactory = (token: string): FakeService => ({
      token: `second-${token}`,
    });

    const { rerender, result } = renderHook(
      ({ factory }: { factory: (token: string) => FakeService }) =>
        useContextAuthedService(factory),
      { initialProps: { factory: firstFactory } },
    );

    rerender({ factory: secondFactory });

    const service = await result.current();
    expect(service.token).toBe('second-token-123');
  });
});
