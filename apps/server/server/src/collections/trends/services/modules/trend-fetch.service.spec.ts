import { TrendFetchService } from '@server/collections/trends/services/modules/trend-fetch.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendFetchService', () => {
  let service: TrendFetchService;

  const mockPrisma = { trend: { create: vi.fn(), findMany: vi.fn() } };
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockCacheService = {
    generateKey: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  };
  const mockApifyService = {
    getInstagramTrends: vi.fn(),
    getPinterestTrends: vi.fn(),
    getRedditTrends: vi.fn(),
    getTikTokTrends: vi.fn(),
    getTwitterTrends: vi.fn(),
    getYouTubeTrends: vi.fn(),
  };
  const mockLinkedInService = {
    getTrends: vi.fn(),
  };
  const mockInstagramService = {
    getTrends: vi.fn(),
  };
  const mockTiktokService = {
    getTrends: vi.fn(),
  };
  const mockXaiService = {
    getTrends: vi.fn(),
  };
  const mockTwitterService = {
    getTrends: vi.fn(),
  };
  const mockRedditService = {
    getTrends: vi.fn(),
  };
  const mockYoutubeService = {
    getTrends: vi.fn(),
  };
  const mockPinterestService = {
    getTrends: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);
    mockCacheService.generateKey.mockImplementation((...parts: string[]) =>
      parts.join(':'),
    );
    mockApifyService.getTwitterTrends.mockResolvedValue([]);
    mockXaiService.getTrends.mockResolvedValue([]);
    mockLinkedInService.getTrends.mockResolvedValue([]);
    mockInstagramService.getTrends.mockResolvedValue([]);
    mockTiktokService.getTrends.mockResolvedValue([]);
    mockTwitterService.getTrends.mockResolvedValue([]);
    mockRedditService.getTrends.mockResolvedValue([]);
    mockYoutubeService.getTrends.mockResolvedValue([]);
    mockPinterestService.getTrends.mockResolvedValue([]);

    service = new TrendFetchService(
      mockPrisma as never,
      mockLoggerService as never,
      mockCacheService as never,
      mockApifyService as never,
      mockInstagramService as never,
      mockLinkedInService as never,
      mockXaiService as never,
      mockTwitterService as never,
      mockRedditService as never,
      mockYoutubeService as never,
      mockPinterestService as never,
      mockTiktokService as never,
    );
  });

  it('filters stale Grok topics with past-year tokens before returning Twitter trends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    mockXaiService.getTrends.mockResolvedValue([
      {
        contentAngle: 'Cover the live reactions',
        context: 'Fans are discussing the opening ceremony from 2024',
        growthRate: 92,
        hashtags: ['#Olympics2024'],
        mentions: 75000,
        topic: '#Olympics2024',
      },
      {
        contentAngle: 'Break down the product launch',
        context: 'Creators are reacting to today’s AI release',
        growthRate: 84,
        hashtags: ['#AIAgents'],
        mentions: 54000,
        topic: '#AIAgents',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe('#AIAgents');
    expect(mockApifyService.getTwitterTrends).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('falls back to Apify when every Grok topic is rejected as stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    mockXaiService.getTrends.mockResolvedValue([
      {
        contentAngle: 'Talk about the old event',
        context: 'Highlights from the completed 2024 Olympics event',
        growthRate: 66,
        hashtags: ['#Olympics2024'],
        mentions: 42000,
        topic: '#Olympics2024',
      },
    ]);

    mockApifyService.getTwitterTrends.mockResolvedValue([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(mockApifyService.getTwitterTrends).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(result).toEqual([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);

    vi.useRealTimers();
  });

  it('prefers official X API trends over Grok and Apify when present', async () => {
    mockTwitterService.getTrends.mockResolvedValue([
      {
        growthRate: 55,
        mentions: 9000,
        topic: '#XTrend',
        url: 'https://twitter.com/i/trends/1',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(mockTwitterService.getTrends).toHaveBeenCalledWith(
      undefined,
      undefined,
    );
    expect(mockXaiService.getTrends).not.toHaveBeenCalled();
    expect(mockApifyService.getTwitterTrends).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        growthRate: 55,
        mentions: 9000,
        metadata: {
          source: 'x-api',
          url: 'https://twitter.com/i/trends/1',
        },
        platform: 'twitter',
        topic: '#XTrend',
      },
    ]);
  });

  it('falls back to the Grok/Apify chain when the X API returns no trends', async () => {
    mockTwitterService.getTrends.mockResolvedValue([]);
    mockApifyService.getTwitterTrends.mockResolvedValue([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);

    const result = await service.fetchTwitterTrends();

    expect(mockXaiService.getTrends).toHaveBeenCalled();
    expect(result).toEqual([
      {
        growthRate: 44,
        mentions: 12000,
        metadata: {},
        platform: 'twitter',
        topic: '#AIAgents',
      },
    ]);
  });

  it('caches personalized X trends per organization/brand and skips a refetch on a hit', async () => {
    mockTwitterService.getTrends.mockResolvedValue([
      {
        growthRate: 55,
        mentions: 9000,
        topic: '#XTrend',
        url: 'https://twitter.com/i/trends/1',
      },
    ]);

    const first = await service.fetchTwitterTrends('org-1', 'brand-1');

    expect(mockCacheService.set).toHaveBeenCalledWith(
      expect.any(String),
      first,
      expect.objectContaining({
        tags: expect.arrayContaining([
          'trends',
          'trends:twitter',
          'trends:twitter:org-1',
          'trends:twitter:brand-1',
        ]),
        ttl: 15 * 60,
      }),
    );

    const cacheKey = mockCacheService.set.mock.calls[0]?.[0];
    mockCacheService.get.mockImplementation((key: string) =>
      Promise.resolve(key === cacheKey ? first : null),
    );
    mockTwitterService.getTrends.mockClear();

    const second = await service.fetchTwitterTrends('org-1', 'brand-1');

    expect(mockTwitterService.getTrends).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it('does not cache global (no org/brand) X trends inside fetchTwitterTrends', async () => {
    mockTwitterService.getTrends.mockResolvedValue([
      {
        growthRate: 55,
        mentions: 9000,
        topic: '#XTrend',
        url: 'https://twitter.com/i/trends/1',
      },
    ]);

    await service.fetchTwitterTrends();

    expect(mockCacheService.set).not.toHaveBeenCalled();
  });

  it('maps LinkedIn live trend topics into TrendData', async () => {
    mockLinkedInService.getTrends.mockResolvedValue([
      {
        growthRate: 72,
        mentions: 6,
        metadata: {
          sampleContent: 'Teams are investing heavily in #ai workflows.',
          source: 'public-scrape',
          trendType: 'hashtag',
          urls: ['https://www.linkedin.com/company/openai/'],
        },
        topic: '#ai',
      },
    ]);

    const result = await service.fetchLinkedInTrends('org-1', 'brand-1');

    expect(mockLinkedInService.getTrends).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
    expect(result).toEqual([
      {
        growthRate: 72,
        mentions: 6,
        metadata: {
          sampleContent: 'Teams are investing heavily in #ai workflows.',
          source: 'public-scrape',
          trendType: 'hashtag',
          urls: ['https://www.linkedin.com/company/openai/'],
        },
        platform: 'linkedin',
        topic: '#ai',
      },
    ]);
  });

  describe('native-first platform discovery', () => {
    it('returns authorized TikTok account signals before Apify for scoped refreshes', async () => {
      mockTiktokService.getTrends.mockResolvedValue([
        {
          growthRate: 18,
          mentions: 12_000,
          metadata: { videoId: 'video-1' },
          topic: '#native-tiktok',
        },
      ]);

      const result = await service.fetchPlatformTrends(
        'tiktok',
        'org-1',
        'brand-1',
      );

      expect(mockTiktokService.getTrends).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
      );
      expect(mockApifyService.getTikTokTrends).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        metadata: expect.objectContaining({
          provider: 'tiktok-api',
          source: 'native-api',
        }),
        platform: 'tiktok',
        topic: '#native-tiktok',
      });
    });

    it('returns authorized Instagram account signals before Apify for scoped refreshes', async () => {
      mockInstagramService.getTrends.mockResolvedValue([
        { growthRate: 12, mentions: 900, topic: '#native-instagram' },
      ]);

      const result = await service.fetchPlatformTrends(
        'instagram',
        'org-1',
        'brand-1',
      );

      expect(mockInstagramService.getTrends).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
      );
      expect(mockApifyService.getInstagramTrends).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        metadata: expect.objectContaining({
          provider: 'instagram-graph-api',
          source: 'native-api',
        }),
        platform: 'instagram',
        topic: '#native-instagram',
      });
    });

    it('uses Apify only for unsupported global TikTok public discovery', async () => {
      mockApifyService.getTikTokTrends.mockResolvedValue([
        {
          growthRate: 20,
          mentions: 1_000,
          platform: 'tiktok',
          topic: '#public-tiktok',
        },
      ]);

      await service.fetchPlatformTrends('tiktok');

      expect(mockTiktokService.getTrends).not.toHaveBeenCalled();
      expect(mockApifyService.getTikTokTrends).toHaveBeenCalledOnce();
    });

    it('returns native Reddit trends without running the Apify actor', async () => {
      mockRedditService.getTrends.mockResolvedValue([
        {
          author: 'creator',
          commentCount: 80,
          createdAt: '2026-08-30T08:00:00Z',
          id: 'reddit-1',
          score: 1500,
          subreddit: 'technology',
          title: 'Native Reddit topic',
          upvoteRatio: 0.96,
          url: 'https://www.reddit.com/r/technology/comments/reddit-1',
        },
      ]);

      const result = await service.fetchPlatformTrends(
        'reddit',
        'org-1',
        'brand-1',
      );

      expect(mockRedditService.getTrends).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        20,
      );
      expect(mockApifyService.getRedditTrends).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          growthRate: 96,
          mentions: 1500,
          platform: 'reddit',
          topic: 'Native Reddit topic',
        }),
      ]);
      expect(result[0]?.metadata).toMatchObject({
        provider: 'reddit-api',
        source: 'native-api',
      });
    });

    it('falls back to Apify when native Reddit returns no signal', async () => {
      mockRedditService.getTrends.mockResolvedValue([]);
      mockApifyService.getRedditTrends.mockResolvedValue([
        {
          growthRate: 50,
          mentions: 500,
          platform: 'reddit',
          topic: 'Fallback Reddit topic',
        },
      ]);

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([
        expect.objectContaining({ topic: 'Fallback Reddit topic' }),
      ]);
      expect(mockApifyService.getRedditTrends).toHaveBeenCalledWith({
        limit: 20,
      });
    });

    it('does not run Apify when a scheduled native-only refresh has no signal', async () => {
      mockRedditService.getTrends.mockResolvedValue([]);

      await expect(
        service.fetchPlatformTrends('reddit', 'org-1', 'brand-1', {
          allowApifyFallback: false,
        }),
      ).resolves.toEqual([]);

      expect(mockApifyService.getRedditTrends).not.toHaveBeenCalled();
    });

    it('falls back to Apify when native Reddit errors', async () => {
      mockRedditService.getTrends.mockRejectedValue(
        new Error('Reddit unavailable'),
      );
      mockApifyService.getRedditTrends.mockResolvedValue([
        {
          growthRate: 50,
          mentions: 500,
          platform: 'reddit',
          topic: 'Fallback Reddit topic',
        },
      ]);

      await expect(service.fetchPlatformTrends('reddit')).resolves.toHaveLength(
        1,
      );
      expect(mockApifyService.getRedditTrends).toHaveBeenCalledOnce();
    });

    it('returns native YouTube mostPopular results before Apify', async () => {
      mockYoutubeService.getTrends.mockResolvedValue([
        {
          channelTitle: 'Creator',
          commentCount: 50,
          id: 'youtube-1',
          likeCount: 950,
          tags: ['ai'],
          title: 'Native YouTube topic',
          url: 'https://www.youtube.com/watch?v=youtube-1',
          viewCount: 10000,
        },
      ]);

      const result = await service.fetchPlatformTrends('youtube');

      expect(mockYoutubeService.getTrends).toHaveBeenCalledWith('US', 20);
      expect(mockApifyService.getYouTubeTrends).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        growthRate: 10,
        mentions: 10000,
        platform: 'youtube',
        topic: 'Native YouTube topic',
      });
      expect(result[0]?.metadata).toMatchObject({
        provider: 'youtube-data-api-v3',
        source: 'native-api',
      });
    });

    it('returns credentialed Pinterest v5 trends before Apify', async () => {
      mockPinterestService.getTrends.mockResolvedValue([
        {
          keyword: 'summer nails',
          monthlyGrowth: 100,
          timeSeries: { '2026-08-17': 71, '2026-08-24': 87 },
          weeklyGrowth: 30,
          yearlyGrowth: 10,
        },
      ]);

      const result = await service.fetchPlatformTrends(
        'pinterest',
        'org-1',
        'brand-1',
      );

      expect(mockPinterestService.getTrends).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'US',
        20,
      );
      expect(mockApifyService.getPinterestTrends).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({
        growthRate: 30,
        mentions: 87,
        platform: 'pinterest',
        topic: 'summer nails',
      });
    });

    it('uses Apify when Pinterest has no eligible business credential', async () => {
      mockPinterestService.getTrends.mockResolvedValue([]);
      mockApifyService.getPinterestTrends.mockResolvedValue([
        {
          growthRate: 20,
          mentions: 100,
          platform: 'pinterest',
          topic: 'Pinterest fallback',
        },
      ]);

      await expect(
        service.fetchPlatformTrends('pinterest', 'org-1', 'brand-1'),
      ).resolves.toEqual([
        expect.objectContaining({ topic: 'Pinterest fallback' }),
      ]);
      expect(mockApifyService.getPinterestTrends).toHaveBeenCalledWith({
        limit: 20,
      });
    });

    it('negative-caches total native and fallback failure', async () => {
      mockRedditService.getTrends.mockRejectedValue(
        new Error('Reddit unavailable'),
      );
      mockApifyService.getRedditTrends.mockRejectedValue(
        new Error('Apify unavailable'),
      );

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'trends:global:reddit',
        [],
        expect.objectContaining({ ttl: 15 * 60 }),
      );

      mockCacheService.get.mockResolvedValue([]);
      mockRedditService.getTrends.mockClear();
      mockApifyService.getRedditTrends.mockClear();

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);
      expect(mockRedditService.getTrends).not.toHaveBeenCalled();
      expect(mockApifyService.getRedditTrends).not.toHaveBeenCalled();
    });
  });

  it('persists fetched provider trends as current tenant-scoped trend documents', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    mockApifyService.getTikTokTrends.mockResolvedValue([
      {
        growthRate: 81,
        mentions: 42500,
        metadata: {
          hashtags: ['#AIVideo'],
          sampleContent: 'Creators are remixing AI video demos.',
        },
        platform: 'tiktok',
        topic: 'AI video remix',
      },
    ]);
    mockApifyService.getInstagramTrends.mockResolvedValue([]);
    mockApifyService.getPinterestTrends.mockResolvedValue([]);
    mockApifyService.getRedditTrends.mockResolvedValue([]);
    mockApifyService.getYouTubeTrends.mockResolvedValue([]);
    mockPrisma.trend.create.mockImplementation(({ data }) =>
      Promise.resolve({
        brandId: data.brandId,
        data,
        id: 'trend-1',
        organizationId: data.organizationId,
      }),
    );

    const result = await service.fetchAndCacheTrends(
      'org-1',
      'brand-1',
      () => 93,
    );

    expect(mockApifyService.getTikTokTrends).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(mockPrisma.trend.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        data: expect.objectContaining({
          growthRate: 81,
          mentions: 42500,
        }),
        isCurrent: true,
        organizationId: 'org-1',
        platform: 'tiktok',
        requiresAuth: true,
        topic: 'AI video remix',
        viralityScore: 93,
      }),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
      platform: 'tiktok',
      topic: 'AI video remix',
      viralityScore: 93,
    });

    vi.useRealTimers();
  });

  describe('fetchPlatformTrends cost containment', () => {
    it('caches an empty result so a failing scrape does not re-run every call', async () => {
      mockApifyService.getTikTokTrends.mockResolvedValue([]);

      await service.fetchPlatformTrends('tiktok');

      expect(mockCacheService.set).toHaveBeenCalledTimes(1);
      const [, value] = mockCacheService.set.mock.calls[0];
      expect(value).toEqual([]);
    });

    it('gives an empty result a shorter life than a successful one', async () => {
      mockApifyService.getTikTokTrends.mockResolvedValue([]);
      await service.fetchPlatformTrends('tiktok');
      const [, , emptyOptions] = mockCacheService.set.mock.calls[0];

      mockCacheService.set.mockClear();
      mockApifyService.getRedditTrends.mockResolvedValue([
        { growthRate: 10, mentions: 5, platform: 'reddit', topic: '#a' },
      ]);
      await service.fetchPlatformTrends('reddit');
      const [, , populatedOptions] = mockCacheService.set.mock.calls[0];

      expect(emptyOptions.ttl).toBeLessThan(populatedOptions.ttl);
    });

    it('holds global trends longer than the 30-minute corpus backfill interval', async () => {
      mockApifyService.getTikTokTrends.mockResolvedValue([
        { growthRate: 10, mentions: 5, platform: 'tiktok', topic: '#a' },
      ]);

      await service.fetchPlatformTrends('tiktok');

      const [, , options] = mockCacheService.set.mock.calls[0];
      expect(options.ttl).toBeGreaterThan(30 * 60);
    });

    it('serves the personalized path from cache instead of re-scraping', async () => {
      mockCacheService.get.mockResolvedValue([
        { growthRate: 10, mentions: 5, platform: 'tiktok', topic: '#cached' },
      ]);

      const trends = await service.fetchPlatformTrends(
        'tiktok',
        'org-1',
        'brand-1',
      );

      expect(trends).toHaveLength(1);
      expect(mockApifyService.getTikTokTrends).not.toHaveBeenCalled();
    });

    it('keys the personalized cache by organization and brand', async () => {
      mockApifyService.getTikTokTrends.mockResolvedValue([]);

      await service.fetchPlatformTrends('tiktok', 'org-1', 'brand-1');
      const [personalizedKey] = mockCacheService.set.mock.calls[0];

      mockCacheService.set.mockClear();
      await service.fetchPlatformTrends('tiktok');
      const [globalKey] = mockCacheService.set.mock.calls[0];

      expect(personalizedKey).toContain('org-1');
      expect(personalizedKey).toContain('brand-1');
      expect(personalizedKey).not.toEqual(globalKey);
    });
  });
});
