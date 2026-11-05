import { describe, expect, it, vi } from 'vitest';
import LegacyFollowingRedirect from './legacy-following-redirect';

// Like Next's own redirect(), the mock ends rendering by throwing.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

describe('canonical Following navigation', () => {
  it.each([
    [
      { orgSlug: 'acme', brandSlug: 'brand' },
      'NEXT_REDIRECT /acme/brand/discovery/following',
    ],
    [{ orgSlug: 'acme' }, 'NEXT_REDIRECT /acme/~/discovery/following'],
  ])('redirects legacy Following URLs for %j', async (params, expected) => {
    await expect(
      LegacyFollowingRedirect({
        params: Promise.resolve(params),
        searchParams: Promise.resolve({ source: 'following' }),
      }),
    ).rejects.toThrow(expected);
  });

  it('leaves other source selections on the Overview page', async () => {
    await expect(
      LegacyFollowingRedirect({
        params: Promise.resolve({ orgSlug: 'acme', brandSlug: 'brand' }),
        searchParams: Promise.resolve({ source: 'owned' }),
      }),
    ).resolves.toBeNull();
  });
});
