import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveAuthToken, resolveRequiredAuthToken } from './auth.helper';

describe('resolveAuthToken', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the provider token getter as the single acquisition choke point', async () => {
    const controller = new AbortController();
    const getToken = vi.fn().mockResolvedValue('provider-token');

    await expect(
      resolveAuthToken(getToken, {
        forceRefresh: true,
        signal: controller.signal,
        template: 'genfeed-jwt',
      }),
    ).resolves.toBe('provider-token');

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith({
      forceRefresh: true,
      signal: controller.signal,
      template: 'genfeed-jwt',
    });
  });

  it('falls back to the Playwright token when the provider has no token', async () => {
    const getToken = vi.fn().mockResolvedValue(null);
    localStorage.setItem('__better_auth_client_jwt', 'playwright-token');

    await expect(resolveAuthToken(getToken)).resolves.toBe('playwright-token');

    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('throws the boundary-specific error when no token is available', async () => {
    const getToken = vi.fn().mockResolvedValue(null);

    await expect(
      resolveRequiredAuthToken(
        getToken,
        undefined,
        () => new Error('Authentication token unavailable'),
      ),
    ).rejects.toThrow('Authentication token unavailable');
  });
});
