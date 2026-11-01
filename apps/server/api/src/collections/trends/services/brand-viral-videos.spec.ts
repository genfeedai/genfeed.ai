import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { Timeframe } from '@genfeedai/contracts';
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
      {
        id: 'agents',
        title: 'AI agents for marketing automation',
        viralScore: 75,
      },
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
    {} as never,
  );
  return { service, brands, videos, preferences, niche };
}

describe('Brand viral videos', () => {
  it('filters before limiting and resolves the brand within its organization', async () => {
    const { service, brands, videos } = setup('AI marketing automation');
    expect(
      await service.getBrandViralVideos('org-1', 'brand-1', { limit: 1 }),
    ).toEqual([
      {
        id: 'agents',
        title: 'AI agents for marketing automation',
        viralScore: 75,
      },
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
    ]);
    expect(result.some((video) => video.id === 'agents')).toBe(false);
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

describe('Brand observed hashtags and sounds', () => {
  const recent = new Date().toISOString();
  const tech = {
    externalId: 'tech',
    platform: 'tiktok',
    title: 'AI agents for marketing automation',
    hashtags: ['#AIAgents', 'aiagents'],
    soundId: 'tech-audio',
    soundName: 'Agent demo',
    soundPlayUrl: 'https://example.test/demo.mp3',
    videoUrl: 'https://example.test/tech',
    viewCount: 42,
    publishedAt: recent,
    isCurrent: true,
  };
  const music = {
    externalId: 'music',
    platform: 'tiktok',
    title: 'Music production session',
    hashtags: ['Music'],
    soundId: 'music-audio',
    soundName: 'Original song',
    publishedAt: recent,
    isCurrent: true,
  };

  it.each([
    ['AI marketing automation', 'aiagents', 'Agent demo'],
    ['Music production', 'music', 'Original song'],
  ])(
    'uses relevant collected videos for %s, without a music ban',
    async (description, tag, sound) => {
      const { service, videos } = setup(description);
      videos.getViralVideos.mockResolvedValue([tech, music] as never);
      const options = {
        timeframe: Timeframe.H72,
        platform: 'tiktok',
        limit: 12,
      } satisfies NonNullable<
        Parameters<TrendsService['getBrandViralVideos']>[2]
      >;
      expect(
        await service.getBrandTrendingHashtags('org-1', 'brand-1', options),
      ).toEqual([
        expect.objectContaining({
          hashtag: tag,
          postCount: 1,
          postCountScope: 'observed',
          growthMeasured: false,
          scoreMeasured: false,
        }),
      ]);
      expect(
        await service.getBrandTrendingSounds('org-1', 'brand-1', options),
      ).toEqual([
        expect.objectContaining({
          soundName: sound,
          usageCount: 1,
          usageCountScope: 'observed',
          scoreMeasured: false,
        }),
      ]);
    },
  );

  it('retains playable evidence and respects platform and timeframe before aggregation', async () => {
    const { service, niche, videos } = setup('AI marketing automation');
    videos.getViralVideos.mockResolvedValue([]);
    niche.get.mockResolvedValue([
      { ...tech, nicheQuery: 'AI marketing' },
      { ...tech, externalId: 'expired', expiresAt: '2020-01-01' },
      { ...tech, externalId: 'old', publishedAt: '2020-01-01' },
      { ...tech, externalId: 'retired', isCurrent: false },
    ] as never);
    expect(
      await service.getBrandTrendingSounds('org-1', 'brand-1', {
        timeframe: Timeframe.H24,
      }),
    ).toEqual([
      expect.objectContaining({
        usageCount: 1,
        playUrl: tech.soundPlayUrl,
        examples: [
          expect.objectContaining({
            externalId: 'tech',
            videoUrl: tech.videoUrl,
          }),
        ],
      }),
    ]);
    expect(
      await service.getBrandTrendingHashtags('org-1', 'brand-1', {
        platform: 'youtube',
        timeframe: Timeframe.H24,
      }),
    ).toEqual([]);
    expect(niche.get).toHaveBeenCalledWith('org-1', 'brand-1');
  });

  it('returns empty for missing brand context and expired snapshots', async () => {
    const { service, niche, videos } = setup('');
    expect(
      await service.getBrandTrendingHashtags('org-1', 'brand-1', {}),
    ).toEqual([]);
    expect(
      await service.getBrandTrendingSounds('org-1', 'brand-1', {}),
    ).toEqual([]);
    expect(videos.getViralVideos).not.toHaveBeenCalled();
    expect(niche.get).not.toHaveBeenCalled();
  });
});

describe('Market observed evidence', () => {
  it('uses the global cache with the requested platform and period, without brand lookup', async () => {
    const { service, brands, videos, niche } = setup('technology');
    videos.getViralVideos.mockResolvedValue([
      {
        externalId: 'm',
        platform: 'tiktok',
        hashtags: ['Music'],
        soundId: 's',
        soundName: 'Song',
      },
    ] as never);
    expect(
      await service.getTrendingHashtags({
        timeframe: Timeframe.D7,
        platform: 'tiktok',
      }),
    ).toEqual([expect.objectContaining({ hashtag: 'music' })]);
    expect(
      await service.getTrendingSounds({
        timeframe: Timeframe.D7,
        platform: 'tiktok',
      }),
    ).toEqual([expect.objectContaining({ soundName: 'Song' })]);
    expect(videos.getViralVideos).toHaveBeenCalledWith({
      timeframe: Timeframe.D7,
      platform: 'tiktok',
      limit: 100,
    });
    expect(brands.findOne).not.toHaveBeenCalled();
    expect(niche.get).not.toHaveBeenCalled();
  });
});

describe('Brand niche eligibility', () => {
  it('does not treat generic video/content words as a niche match', async () => {
    const { service, videos, preferences } = setup(
      'AI video content creation platform',
    );
    preferences.getPreferences.mockResolvedValue({
      keywords: ['AI agents'],
      categories: [],
      hashtags: [],
      platforms: [],
    });
    videos.getViralVideos.mockResolvedValue([
      {
        externalId: 'generic',
        platform: 'tiktok',
        title: 'Official music video',
        hashtags: ['content'],
        soundId: 'global-song',
      },
      {
        externalId: 'relevant',
        platform: 'tiktok',
        title: 'AI agents for creators',
        hashtags: ['aiagents'],
        soundId: 'agent-demo',
      },
    ] as never);
    expect(
      (await service.getBrandTrendingHashtags('org-1', 'brand-1', {})).map(
        (tag) => tag.hashtag,
      ),
    ).toEqual(['aiagents']);
    expect(
      (await service.getBrandTrendingSounds('org-1', 'brand-1', {})).map(
        (sound) => sound.soundId,
      ),
    ).toEqual(['agent-demo']);
  });
});
