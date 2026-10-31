import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublishedReleases } from './releases.data';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
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
  it.each(['test-token', ''])(
    'uses optional server token %s',
    async (token) => {
      vi.stubEnv('GITHUB_TOKEN', token);
      const fetcher = vi.fn().mockResolvedValue(new Response('[]'));
      vi.stubGlobal('fetch', fetcher);
      await getPublishedReleases();
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.github.com/repos/genfeedai/genfeed.ai/releases?',
        ),
        expect.objectContaining({
          headers: token
            ? {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
              }
            : { Accept: 'application/vnd.github+json' },
        }),
      );
    },
  );
  it.each([401, 403])(
    'retries rejected token %s anonymously and stays anonymous on later pages',
    async (status) => {
      vi.stubEnv('GITHUB_TOKEN', 'rejected-token');
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status }))
        .mockResolvedValueOnce(
          new Response('[]', {
            headers: {
              link: '<https://api.github.com/releases?page=2>; rel="next"',
            },
          }),
        )
        .mockResolvedValueOnce(new Response('[]'));
      vi.stubGlobal('fetch', fetcher);
      await expect(getPublishedReleases()).resolves.toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
        'Bearer rejected-token',
      );
      expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0]);
      expect(fetcher.mock.calls[1][1].headers).toEqual({
        Accept: 'application/vnd.github+json',
      });
      expect(fetcher.mock.calls[2][1].headers).toEqual({
        Accept: 'application/vnd.github+json',
      });
      expect(fetcher.mock.calls[2][0]).toContain('page=2');
    },
  );
  it('surfaces anonymous retry failure without retrying indefinitely', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'rejected-token');
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getPublishedReleases()).rejects.toThrow('403');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['', 401],
    ['valid-token', 503],
  ])('does not retry unrelated failures (%s, %s)', async (token, status) => {
    vi.stubEnv('GITHUB_TOKEN', token);
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getPublishedReleases()).rejects.toThrow(String(status));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fails loudly on GitHub errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    );
    await expect(getPublishedReleases()).rejects.toThrow('503');
  });
});
