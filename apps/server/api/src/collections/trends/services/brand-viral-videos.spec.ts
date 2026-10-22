import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { describe, expect, it, vi } from 'vitest';

function setup(description: string) {
  const brands = { findOne: vi.fn().mockResolvedValue({ description }) };
  const preferences = {
    getPreferences: vi.fn().mockResolvedValue({
      keywords: [],
      categories: [],
      hashtags: [],
      platforms: [],
    }),
  };
  const niche = {
    fetchAndCache: vi.fn().mockResolvedValue(2),
    get: vi.fn().mockResolvedValue([]),
  };
  const videos = {
    getViralVideos: vi.fn().mockResolvedValue([
      { id: 'music', title: 'Popular official music video', viralScore: 99 },
      { id: 'agents', title: 'AI agents automate marketing', viralScore: 75 },
    ]),
  };
  const filtering = new TrendFilteringService({} as never, {} as never);
  const service = new TrendsService(
    {} as never,
    brands as never,
    {} as never,
    preferences as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    filtering,
    videos as never,
    {} as never,
    {} as never,
    niche as never,
  );
  return { service, brands, videos, preferences, niche };
}

describe('Brand viral videos', () => {
  it('filters before limiting and resolves the brand within its organization', async () => {
    const { service, brands, videos } = setup('AI marketing automation');
    expect(
      await service.getBrandViralVideos('org-1', 'brand-1', { limit: 1 }),
    ).toEqual([
      { id: 'agents', title: 'AI agents automate marketing', viralScore: 75 },
    ]);
    expect(brands.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'org-1',
      isDeleted: false,
    });
    expect(videos.getViralVideos).toHaveBeenCalledWith({ limit: 100 });
  });
  it('does not substitute a global music chart when nothing matches', async () => {
    expect(
      await setup('fitness nutrition').service.getBrandViralVideos(
        'org-1',
        'brand-1',
        { limit: 12 },
      ),
    ).toEqual([]);
  });
  it('does not fetch global videos without usable brand context', async () => {
    const { service, videos } = setup('');
    expect(await service.getBrandViralVideos('org-1', 'brand-1', {})).toEqual(
      [],
    );
    expect(videos.getViralVideos).not.toHaveBeenCalled();
  });
  it('uses explicit brand discovery preferences', async () => {
    const { service, preferences } = setup('fitness nutrition');
    preferences.getPreferences.mockResolvedValue({
      keywords: ['AI agents'],
      categories: [],
      hashtags: [],
      platforms: [],
    });
    expect(
      await service.getBrandViralVideos('org-1', 'brand-1', {}),
    ).toHaveLength(1);
  });
  it('rejects nonexistent brand scope before looking up the content cache', async () => {
    const { service, brands } = setup('AI marketing');
    brands.findOne.mockResolvedValue(null as never);
    await expect(
      service.getTrendContent('org-1', 'foreign-brand', {}),
    ).rejects.toThrow('Brand not found');
  });

  it('leads with videos found by searching the brand niche, ranked by relevance then engagement', async () => {
    const { service, niche, preferences } = setup('AI marketing automation');
    preferences.getPreferences.mockResolvedValue({
      keywords: ['ai influencers'],
      categories: [],
      hashtags: [],
      platforms: [],
    });
    niche.get.mockResolvedValue([
      {
        externalId: 'quiet',
        nicheQuery: 'ai influencers',
        platform: 'tiktok',
        title: 'no caption match',
        viewCount: 10,
        viralScore: 5,
      },
      {
        externalId: 'big',
        nicheQuery: 'ai influencers',
        platform: 'tiktok',
        title: 'Exposing AI influencers',
        viewCount: 90,
        viralScore: 40,
      },
      {
        externalId: 'popular',
        nicheQuery: 'ai influencers',
        platform: 'tiktok',
        title: 'AI influencers are here',
        viewCount: 500,
        viralScore: 90,
      },
    ]);

    const result = await service.getBrandViralVideos('org-1', 'brand-1', {
      limit: 4,
    });

    expect(niche.get).toHaveBeenCalledWith('org-1', 'brand-1');
    expect(result.map((video) => video.externalId)).toEqual([
      'popular',
      'big',
      'quiet',
      undefined,
    ]);
    expect(result[3]).toMatchObject({ id: 'agents' });
  });

  it('respects the platform filter for niche videos', async () => {
    const { service, niche, preferences } = setup('fitness');
    preferences.getPreferences.mockResolvedValue({
      keywords: ['ai influencers'],
      categories: [],
      hashtags: [],
      platforms: ['instagram'],
    });
    niche.get.mockResolvedValue([
      { externalId: 'tt', nicheQuery: 'q', platform: 'tiktok', title: 'x' },
    ]);

    expect(await service.getBrandViralVideos('org-1', 'brand-1', {})).toEqual(
      [],
    );
  });

  it('refreshes niche videos from the brand keywords and rejects foreign brands', async () => {
    const { service, niche, brands, preferences } = setup('fitness');
    preferences.getPreferences.mockResolvedValue({
      keywords: ['ai influencers', 'ugc'],
      categories: [],
      hashtags: ['#aiavatar'],
      platforms: [],
    });

    expect(
      await service.fetchAndCacheBrandNicheVideos('org-1', 'brand-1'),
    ).toBe(2);
    expect(niche.fetchAndCache).toHaveBeenCalledWith('org-1', 'brand-1', [
      'ai influencers',
      'ugc',
      'aiavatar',
    ]);

    brands.findOne.mockResolvedValue(null as never);
    await expect(
      service.fetchAndCacheBrandNicheVideos('org-1', 'foreign-brand'),
    ).rejects.toThrow('Brand not found');
  });

  it('does not expose videos when brand lookup fails', async () => {
    const { service, brands, videos } = setup('AI marketing');
    brands.findOne.mockResolvedValue(null as never);
    await expect(
      service.getBrandViralVideos('org-1', 'foreign-brand', {}),
    ).rejects.toThrow('Brand not found');
    expect(videos.getViralVideos).not.toHaveBeenCalled();
  });
});
