import type { CacheService } from '@api/services/cache/cache.service';
import type { ConfigService } from '@libs/config/config.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicXBrandSourceService } from './public-x-brand-source.service';
import { publicXHandle } from './public-x-handle.util';

function setup(bearer: string | undefined = 'test-app-token') {
  const values = new Map<string, unknown>();
  const cache = {
    getOrSetWithLock: vi.fn(
      async (key: string, load: () => Promise<unknown>) => {
        if (!values.has(key)) values.set(key, await load());
        return values.get(key);
      },
    ),
  };
  const service = new PublicXBrandSourceService(
    { get: () => bearer } as unknown as ConfigService,
    cache as unknown as CacheService,
  );
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  return { service, fetcher, cache };
}
const user = {
  id: '123',
  name: 'Acme',
  username: 'Acme',
  description: 'Public bio',
  profile_image_url: 'https://pbs.twimg.com/a_normal.jpg',
  profile_banner_url: 'https://pbs.twimg.com/profile_banners/123/123',
};
const latest = { id: '101', text: 'Our new collection is here.' };
afterEach(() => vi.unstubAllGlobals());
describe('public X brand source', () => {
  it('recognizes profile URLs and rejects post URLs, application routes and lookalike hosts', () => {
    expect(publicXHandle('https://twitter.com/AcMe/?lang=en')).toBe('acme');
    for (const url of [
      'https://x.com/acme/status/9',
      'https://x.com/home',
      'https://x.com.example/acme',
      'https://x.com@elsewhere.example/acme',
    ])
      expect(publicXHandle(url)).toBeUndefined();
  });
  it('shares the app-only profile read and uses its expanded post as voice evidence', async () => {
    const { service, fetcher, cache } = setup();
    fetcher.mockResolvedValueOnce(
      Response.json({
        data: { ...user, most_recent_post_id: '101' },
        includes: { posts: [latest] },
      }),
    );
    const [profile] = await Promise.all([
      service.profile('acme'),
      service.profile('acme'),
    ]);
    expect(profile).toMatchObject({
      name: 'Acme',
      latestText: latest.text,
      avatar: 'https://pbs.twimg.com/a_400x400.jpg',
      banner: 'https://pbs.twimg.com/profile_banners/123/123/1500x500',
    });
    expect(await service.voiceSamples('acme')).toEqual([
      { id: '101', text: latest.text, publishedAt: null },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain('expansions=most_recent_post_id');
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-app-token' });
    expect(cache.getOrSetWithLock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      { ttl: 86400 },
      expect.any(Number),
    );
  });
  it('reads one bounded page only for voice and caches even an empty result', async () => {
    const { service, fetcher } = setup();
    fetcher
      .mockResolvedValueOnce(Response.json({ data: user }))
      .mockResolvedValueOnce(Response.json({ meta: { result_count: 0 } }));
    await service.profile('acme');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await service.voiceSamples('acme')).toEqual([]);
    expect(await service.voiceSamples('acme')).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/2/users/123/tweets');
    expect(url.searchParams.get('max_results')).toBe('5');
    expect(url.searchParams.get('exclude')).toBe('replies,retweets');
  });
  it('uses original writing from the timeline when the latest post is a repost', async () => {
    const { service, fetcher } = setup();
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          data: user,
          includes: { posts: [{ ...latest, text: 'RT @acct: their words' }] },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [latest, { id: '102', text: 'Their text', author_id: '456' }],
          meta: { next_token: 'more' },
        }),
      );
    expect(await service.voiceSamples('acme')).toEqual([
      { id: '101', text: latest.text, publishedAt: null },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('never reads a protected timeline', async () => {
    const { service, fetcher } = setup();
    fetcher.mockResolvedValueOnce(
      Response.json({
        data: { ...user, protected: true },
        includes: { posts: [latest] },
      }),
    );
    expect(await service.voiceSamples('acme')).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
