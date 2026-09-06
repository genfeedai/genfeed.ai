import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublishedReleases } from './releases.data';

afterEach(() => vi.unstubAllGlobals());
describe('published releases', () => {
  it('paginates, excludes drafts and prereleases, and sorts publication dates', async () => {
    const release = (
      tag_name: string,
      published_at: string,
      draft = false,
      prerelease = false,
    ) => ({ tag_name, published_at, draft, prerelease, body: '' });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            release('v1', '2026-01-01'),
            release('draft', '2026-03-01', true),
            release('beta', '2026-03-01', false, true),
          ]),
          {
            headers: {
              link: '<https://api.github.com/repos/genfeedai/genfeed.ai/releases?per_page=100&page=2>; rel="next"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([release('v2', '2026-02-01')])),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await getPublishedReleases()).map((release) => release.tag),
    ).toEqual(['v2', 'v1']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('fails loudly on GitHub errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    );
    await expect(getPublishedReleases()).rejects.toThrow('503');
  });
});
