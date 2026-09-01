// @vitest-environment jsdom

import { CredentialPlatform } from '@genfeedai/enums';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryWrapper } from '../../tests/query-wrapper';

const getConnectReadiness = vi.fn();
const getService = vi.fn(async () => ({ getConnectReadiness }));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user-1',
  }),
}));

import { useOAuthConnectPlatforms } from './use-oauth-connect-platforms';

describe('useOAuthConnectPlatforms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails Threads closed while readiness is unknown', () => {
    getConnectReadiness.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    expect(
      result.current.find(
        (item) => item.platform === CredentialPlatform.THREADS,
      ),
    ).toMatchObject({
      isConnectAvailable: false,
      readiness: 'unknown',
    });
  });

  it('keeps Threads unavailable when the server reports unavailable', async () => {
    getConnectReadiness.mockResolvedValue({ status: 'unavailable' });

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(
        result.current.find(
          (item) => item.platform === CredentialPlatform.THREADS,
        ),
      ).toMatchObject({
        isConnectAvailable: false,
        readiness: 'unavailable',
      });
    });
  });

  it('enables Threads when the server reports available', async () => {
    getConnectReadiness.mockResolvedValue({ status: 'available' });

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(
        result.current.find(
          (item) => item.platform === CredentialPlatform.THREADS,
        ),
      ).toMatchObject({
        isConnectAvailable: true,
        readiness: 'available',
      });
    });
  });

  it('returns Threads to unknown after a readiness request failure', async () => {
    getConnectReadiness.mockRejectedValue(new Error('capability unavailable'));

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(getConnectReadiness).toHaveBeenCalled());
    expect(
      result.current.find(
        (item) => item.platform === CredentialPlatform.THREADS,
      ),
    ).toMatchObject({
      isConnectAvailable: false,
      readiness: 'unknown',
    });
  });
});
