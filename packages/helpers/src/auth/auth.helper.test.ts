import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBetterAuthTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/auth-client', () => ({
  getBetterAuthToken: getBetterAuthTokenMock,
}));

import { resolveAuthToken } from './auth.helper';

describe('resolveAuthToken', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    getBetterAuthTokenMock.mockReset();
    storage.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  it('uses the Better Auth token first by default', async () => {
    const getToken = vi.fn().mockResolvedValue('provider-token');
    getBetterAuthTokenMock.mockResolvedValue('better-auth-token');

    await expect(resolveAuthToken(getToken)).resolves.toBe('better-auth-token');

    expect(getToken).not.toHaveBeenCalled();
  });

  it('honors forceRefresh by asking the provider for a fresh token first', async () => {
    const getToken = vi.fn().mockResolvedValue('fresh-provider-token');
    getBetterAuthTokenMock.mockResolvedValue('stale-better-auth-token');

    await expect(
      resolveAuthToken(getToken, { forceRefresh: true, template: 'genfeed' }),
    ).resolves.toBe('fresh-provider-token');

    expect(getToken).toHaveBeenCalledWith({
      forceRefresh: true,
      template: 'genfeed',
    });
    expect(getBetterAuthTokenMock).not.toHaveBeenCalled();
  });

  it('falls back when the direct Better Auth token lookup fails', async () => {
    const getToken = vi.fn().mockResolvedValue(null);
    getBetterAuthTokenMock.mockRejectedValue(new Error('session unavailable'));
    window.localStorage.setItem('__better_auth_client_jwt', 'playwright-token');

    await expect(resolveAuthToken(getToken)).resolves.toBe('playwright-token');

    expect(getToken).toHaveBeenCalledWith(undefined);
  });
});
