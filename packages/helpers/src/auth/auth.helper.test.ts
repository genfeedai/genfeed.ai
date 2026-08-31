import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPlaywrightJwtToken,
  normalizeAuthAvatarUrl,
  resolveAuthToken,
  resolveRequiredAuthToken,
} from './auth.helper';

describe('normalizeAuthAvatarUrl', () => {
  it.each([
    'https://img.clerk.com/proxy/avatar',
    'https://images.clerk.dev/oauth_google/avatar',
    'https://cdn.clerk.com/avatar.png',
    'https://assets.clerk.dev/avatar.png',
  ])('rejects a legacy Clerk-hosted avatar: %s', (url) => {
    expect(normalizeAuthAvatarUrl(url)).toBeNull();
  });

  it('keeps an avatar hosted by the current identity provider', () => {
    expect(
      normalizeAuthAvatarUrl('https://lh3.googleusercontent.com/avatar.png'),
    ).toBe('https://lh3.googleusercontent.com/avatar.png');
  });

  it.each([null, undefined, '', 'not-a-url'])(
    'rejects an absent or invalid avatar URL: %s',
    (url) => {
      expect(normalizeAuthAvatarUrl(url)).toBeNull();
    },
  );
});

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

  it('ignores an unavailable browser storage implementation', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

    expect(getPlaywrightJwtToken()).toBeNull();
    getItem.mockRestore();
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
