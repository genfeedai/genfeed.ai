import { describe, expect, it, vi } from 'vitest';
import LegacyLibraryQueryRedirect from './legacy-library-query-redirect';

// Like Next's own permanentRedirect(), the mock ends rendering by throwing.
vi.mock('next/navigation', () => ({
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const params = Promise.resolve({ brandSlug: 'brand', orgSlug: 'acme' });

describe('LegacyLibraryQueryRedirect', () => {
  it.each([
    [{ place: 'trash' }, 'NEXT_REDIRECT /acme/brand/library/trash'],
    [
      { shelf: 'needs-review' },
      'NEXT_REDIRECT /acme/brand/library/shelf/needs-review',
    ],
    [{ categories: ['GIF'] }, 'NEXT_REDIRECT /acme/brand/library/gifs'],
  ])('moves the legacy query %j to its route', async (search, expected) => {
    await expect(
      LegacyLibraryQueryRedirect({
        params,
        searchParams: Promise.resolve(search),
      }),
    ).rejects.toThrow(expected);
  });

  it.each([{}, { folder: 'f1', search: 'hero' }])(
    'keeps %j on All assets',
    async (search) => {
      await expect(
        LegacyLibraryQueryRedirect({
          params,
          searchParams: Promise.resolve(search),
        }),
      ).resolves.toBeNull();
    },
  );
});
