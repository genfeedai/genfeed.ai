import { TrendBrandNicheVideoService } from '@api/collections/trends/services/modules/trend-brand-niche-video.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendBrandNicheVideoService', () => {
  const logger = { log: vi.fn() };
  const cache = {
    generateKey: vi.fn((namespace: string, ...parts: string[]) =>
      [namespace, ...parts].join(':'),
    ),
    get: vi.fn(),
    set: vi.fn(),
  };
  const apify = { searchTikTokByQueries: vi.fn() };
  let service: TrendBrandNicheVideoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendBrandNicheVideoService(
      logger as never,
      cache as never,
      apify as never,
    );
  });

  it('stores a brand search under the organization and brand, not in the shared table', async () => {
    apify.searchTikTokByQueries.mockResolvedValue([
      { externalId: 'a', nicheQuery: 'ai influencers', platform: 'tiktok' },
      { externalId: 'a', nicheQuery: 'ai influencers', platform: 'tiktok' },
      { externalId: 'b', nicheQuery: 'ai influencers', platform: 'tiktok' },
    ]);
    cache.set.mockResolvedValue(true);

    const count = await service.fetchAndCache('org-1', 'brand-1', [
      'ai influencers',
    ]);

    expect(count).toBe(2);
    expect(apify.searchTikTokByQueries).toHaveBeenCalledWith(
      ['ai influencers'],
      { limit: 30 },
      { organizationId: 'org-1', origin: 'social-source' },
    );
    expect(cache.set).toHaveBeenCalledWith(
      'trends:brand-niche-videos:org-1:brand-1',
      [
        expect.objectContaining({ externalId: 'a', isCurrent: true }),
        expect.objectContaining({ externalId: 'b' }),
      ],
      expect.objectContaining({ ttl: 36 * 60 * 60 }),
    );
  });

  it('keeps the last snapshot when a search returns nothing', async () => {
    apify.searchTikTokByQueries.mockResolvedValue([]);

    expect(await service.fetchAndCache('org-1', 'brand-1', ['q'])).toBe(0);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not call Apify without queries', async () => {
    expect(await service.fetchAndCache('org-1', 'brand-1', [])).toBe(0);
    expect(apify.searchTikTokByQueries).not.toHaveBeenCalled();
  });

  it('reads only the requested organization and brand snapshot', async () => {
    cache.get.mockResolvedValue([{ externalId: 'a' }]);

    expect(await service.get('org-1', 'brand-1')).toEqual([
      { externalId: 'a' },
    ]);
    expect(cache.get).toHaveBeenCalledWith(
      'trends:brand-niche-videos:org-1:brand-1',
    );
    expect(await service.get('org-1', '')).toEqual([]);
  });
});
