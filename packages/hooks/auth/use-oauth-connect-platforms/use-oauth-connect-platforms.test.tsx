// @vitest-environment jsdom

import { CredentialPlatform } from '@genfeedai/contracts';
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

  it('leaves Threads out while readiness is unknown', () => {
    getConnectReadiness.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    expect(
      result.current.some(
        (item) => item.platform === CredentialPlatform.THREADS,
      ),
    ).toBe(false);
  });

  it('leaves Threads out when the server reports unavailable', async () => {
    getConnectReadiness.mockResolvedValue({ status: 'unavailable' });

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(getConnectReadiness).toHaveBeenCalled());
    expect(
      result.current.some(
        (item) => item.platform === CredentialPlatform.THREADS,
      ),
    ).toBe(false);
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

  it('leaves Threads out after a readiness request failure', async () => {
    getConnectReadiness.mockRejectedValue(new Error('capability unavailable'));

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(getConnectReadiness).toHaveBeenCalled());
    expect(
      result.current.some(
        (item) => item.platform === CredentialPlatform.THREADS,
      ),
    ).toBe(false);
  });

  it('leaves Google Business out until the server reports it available', async () => {
    getConnectReadiness.mockResolvedValue({ status: 'unavailable' });

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(getConnectReadiness).toHaveBeenCalled());
    expect(
      result.current.some(
        (item) => item.platform === CredentialPlatform.GOOGLE_BUSINESS,
      ),
    ).toBe(false);
  });

  it('shows Google Business once the server reports it available', async () => {
    getConnectReadiness.mockResolvedValue({ status: 'available' });

    const { result } = renderHook(() => useOAuthConnectPlatforms(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(
        result.current.find(
          (item) => item.platform === CredentialPlatform.GOOGLE_BUSINESS,
        ),
      ).toMatchObject({ isConnectAvailable: true, readiness: 'available' });
    });
  });
});
