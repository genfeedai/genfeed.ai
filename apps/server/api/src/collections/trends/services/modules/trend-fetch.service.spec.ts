import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import {
  captureTrendRefreshEvidence,
  recordTrendProviderOutcome,
} from '@api/collections/trends/utils/trend-refresh-evidence.util';
import {
  InstagramHashtagAccessError,
  InstagramHashtagBudgetError,
} from '@api/services/integrations/instagram/services/instagram-hashtag-search.service';
import { LinkedInTrendResolverService } from '@api/services/integrations/linkedin/services/linkedin-trend-resolver.service';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendFetchService', () => {
  let service: TrendFetchService;

  const mockPrisma = {
    trend: { create: vi.fn(), findMany: vi.fn() },
    brand: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ description: 'AI content automation' }),
    },
    trendPreferences: {
      findFirst: vi.fn().mockResolvedValue({
        config: { keywords: ['AI agents', 'content automation'] },
      }),
    },
  };
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
    getTwitterTrends: vi.fn(),
  };
  const mockLinkedInService = {
    getTrends: vi.fn(),
  };
  const mockInstagramService = {
    getTrends: vi.fn(),
  };
  const mockInstagramHashtagSearch = {
    readTopMedia: vi.fn(),
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

  const refreshHealth = { record: vi.fn().mockResolvedValue(undefined) };

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
      refreshHealth as never,
      mockInstagramHashtagSearch as never,
    );
  });

  it('collects scoped YouTube videos from brand keywords without a global fallback', async () => {
    await service.fetchPlatformTrends('youtube', 'org-1', 'brand-1');
    expect(mockYoutubeService.getTrends).toHaveBeenCalledWith(
      'US',
      20,
      'AI agents|content automation',
    );
    expect(mockPrisma.brand.findFirst).toHaveBeenCalledWith({
      select: { description: true },
      where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
    });
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

  describe('LinkedIn public scrape evidence', () => {
    const mockBrandScraper = { scrapeLinkedIn: vi.fn() };

    beforeEach(() => {
      const resolver = new LinkedInTrendResolverService(
        mockBrandScraper as never,
        runtimeSettingsMock({ get: vi.fn() }),
        mockLoggerService as never,
      );
      mockLinkedInService.getTrends.mockImplementation(
        (organizationId?: string, brandId?: string) =>
          resolver.resolve(organizationId, brandId),
      );
    });

    it('records a failed refresh when every public source is blocked', async () => {
      mockBrandScraper.scrapeLinkedIn.mockRejectedValue(
        Object.assign(new Error('Failed to fetch LinkedIn page: 403'), {
          status: 403,
        }),
      );

      const trends = await service.fetchAndCacheTrends(
        'org-1',
        'brand-1',
        undefined,
        { allowApifyFallback: false, platforms: ['linkedin'] },
      );

      expect(trends).toEqual([]);
      expect(refreshHealth.record).toHaveBeenCalledWith('org-1', [
        expect.objectContaining({
          lastSuccessfulRefreshAt: null,
          outcome: 'native_failed',
          platform: 'linkedin',
          reason: 'access_required',
        }),
      ]);
    });

    it('still records a successful refresh when only some public sources fail', async () => {
      mockBrandScraper.scrapeLinkedIn
        .mockResolvedValueOnce({
          recentPosts: [
            'We are seeing strong momentum around #AI and enterprise adoption.',
            'Builders are shipping new workflows for #AI teams.',
          ],
          sourceUrl: 'https://www.linkedin.com/company/openai/',
        })
        .mockRejectedValue(
          Object.assign(new Error('Failed to fetch LinkedIn page: 403'), {
            status: 403,
          }),
        );
      mockPrisma.trend.create.mockImplementation(
        async ({ data }: { data: { topic: string } }) => ({
          ...data,
          data: {},
          id: 'trend-1',
        }),
      );

      await service.fetchAndCacheTrends('org-1', 'brand-1', undefined, {
        allowApifyFallback: false,
        platforms: ['linkedin'],
      });

      expect(refreshHealth.record).toHaveBeenCalledWith('org-1', [
        expect.objectContaining({
          lastSuccessfulRefreshAt: expect.any(String),
          outcome: 'native_available',
          platform: 'linkedin',
        }),
      ]);
    });
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
      mockPrisma.trendPreferences.findFirst.mockResolvedValueOnce(null);
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

    it('stores the official hashtag search media as the trend preview, without asking Apify', async () => {
      mockPrisma.trendPreferences.findFirst.mockResolvedValueOnce({
        config: { hashtags: ['#Coffee'], keywords: [] },
      });
      mockInstagramHashtagSearch.readTopMedia.mockResolvedValue([
        {
          hashtag: 'coffee',
          items: [
            {
              caption: 'Morning pour',
              commentsCount: 4,
              id: 'media-1',
              likeCount: 96,
              mediaType: 'IMAGE',
              mediaUrl: 'https://cdn.example/1.jpg',
              permalink: 'https://www.instagram.com/p/abc/',
              timestamp: '2026-11-22T08:00:00+0000',
            },
            {
              commentsCount: 1,
              id: 'media-2',
              likeCount: 9,
              mediaType: 'CAROUSEL_ALBUM',
              permalink: 'https://www.instagram.com/p/def/',
            },
          ],
        },
      ]);

      const result = await service.fetchPlatformTrends(
        'instagram',
        'org-1',
        'brand-1',
      );

      expect(mockInstagramHashtagSearch.readTopMedia).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        ['#Coffee'],
      );
      expect(mockApifyService.getInstagramTrends).not.toHaveBeenCalled();
      expect(mockInstagramService.getTrends).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        mentions: 110,
        platform: 'instagram',
        topic: '#coffee',
      });
      expect(result[0].metadata).toMatchObject({
        provider: 'instagram-hashtag-search',
        sourcePreviewState: 'live',
      });
      expect(result[0].metadata?.sourcePreviewCache).toEqual([
        {
          contentType: 'image',
          id: 'media-1',
          mediaUrl: 'https://cdn.example/1.jpg',
          metrics: { comments: 4, likes: 96 },
          platform: 'instagram',
          publishedAt: '2026-11-22T08:00:00+0000',
          sourceUrl: 'https://www.instagram.com/p/abc/',
          text: 'Morning pour',
          thumbnailUrl: 'https://cdn.example/1.jpg',
        },
        {
          // No media_url: the permalink alone, and no thumbnail.
          contentType: 'image',
          id: 'media-2',
          metrics: { comments: 1, likes: 9 },
          platform: 'instagram',
          sourceUrl: 'https://www.instagram.com/p/def/',
        },
      ]);
    });

    it.each([
      [
        'the week budget is spent',
        new InstagramHashtagBudgetError(),
        'budget_exhausted',
      ],
      [
        'the app lacks Public Content Access',
        new InstagramHashtagAccessError(),
        'access_required',
      ],
    ])(
      'records refresh health, not a healthy source, when %s',
      async (_name, error, reason) => {
        mockPrisma.trendPreferences.findFirst.mockResolvedValueOnce({
          config: { hashtags: ['coffee'] },
        });
        mockInstagramHashtagSearch.readTopMedia.mockRejectedValue(error);

        const { evidence, result } = await captureTrendRefreshEvidence(() =>
          service.fetchPlatformTrends('instagram', 'org-1', 'brand-1', {
            allowApifyFallback: false,
          }),
        );

        expect(result).toEqual([]);
        expect(evidence).toHaveLength(1);
        expect(evidence[0]).toMatchObject({
          outcome: 'native_failed',
          platform: 'instagram',
          reason,
        });
        expect(evidence[0].lastSuccessfulRefreshAt).toBeNull();
      },
    );

    it('reads no global TikTok trends and starts no scraper run', async () => {
      await expect(service.fetchPlatformTrends('tiktok')).resolves.toEqual([]);

      expect(mockTiktokService.getTrends).not.toHaveBeenCalled();
      expect(mockApifyService.getInstagramTrends).not.toHaveBeenCalled();
      expect(mockApifyService.getTwitterTrends).not.toHaveBeenCalled();
    });

    it('returns native Reddit trends', async () => {
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

    it('returns nothing when native Reddit returns no signal', async () => {
      mockRedditService.getTrends.mockResolvedValue([]);

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);
    });

    it('records an unavailable native feed when Reddit has no app credentials', async () => {
      mockRedditService.getTrends.mockImplementation(async () => {
        recordTrendProviderOutcome('native_empty', 'native_unavailable');
        return [];
      });

      await service.fetchAndCacheTrends(undefined, undefined, undefined, {
        platforms: ['reddit'],
      });

      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.objectContaining({
          lastSuccessfulRefreshAt: null,
          outcome: 'native_empty',
          platform: 'reddit',
          reason: 'native_unavailable',
        }),
      ]);
    });

    it('returns nothing when native Reddit errors', async () => {
      mockRedditService.getTrends.mockRejectedValue(
        new Error('Reddit unavailable'),
      );

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);
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
      expect(result[0]).toMatchObject({
        growthRate: 30,
        mentions: 87,
        platform: 'pinterest',
        topic: 'summer nails',
      });
    });

    it('returns nothing when Pinterest has no eligible business credential', async () => {
      mockPinterestService.getTrends.mockResolvedValue([]);

      await expect(
        service.fetchPlatformTrends('pinterest', 'org-1', 'brand-1'),
      ).resolves.toEqual([]);
    });

    it('shares one Apify scrape across organizations instead of paying per scope', async () => {
      mockApifyService.getInstagramTrends.mockResolvedValue([
        {
          growthRate: 10,
          mentions: 500,
          platform: 'instagram',
          topic: '#shared',
        },
      ]);

      await service.fetchPlatformTrends('instagram');

      const sharedCall = mockCacheService.set.mock.calls.find(
        ([key]) => key === 'trends:apify-fallback:instagram',
      );
      expect(sharedCall).toBeDefined();
      expect(sharedCall?.[2]).toMatchObject({ ttl: 6 * 60 * 60 });

      mockCacheService.get.mockImplementation((key: string) =>
        Promise.resolve(
          key === 'trends:apify-fallback:instagram' ? sharedCall?.[1] : null,
        ),
      );
      mockApifyService.getInstagramTrends.mockClear();

      await expect(
        service.fetchPlatformTrends('instagram', 'org-2', 'brand-2'),
      ).resolves.toEqual([expect.objectContaining({ topic: '#shared' })]);
      expect(mockApifyService.getInstagramTrends).not.toHaveBeenCalled();
    });

    it('does not share a failed Apify scrape', async () => {
      mockApifyService.getInstagramTrends.mockRejectedValue(
        new Error('Apify unavailable'),
      );

      await service.fetchPlatformTrends('instagram');

      expect(mockCacheService.set).not.toHaveBeenCalledWith(
        'trends:apify-fallback:instagram',
        expect.anything(),
        expect.anything(),
      );
    });

    it('negative-caches a native failure', async () => {
      mockRedditService.getTrends.mockRejectedValue(
        new Error('Reddit unavailable'),
      );

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'trends:global:reddit',
        [],
        expect.objectContaining({ ttl: 15 * 60 }),
      );

      mockCacheService.get.mockResolvedValue([]);
      mockRedditService.getTrends.mockClear();

      await expect(service.fetchPlatformTrends('reddit')).resolves.toEqual([]);
      expect(mockRedditService.getTrends).not.toHaveBeenCalled();
    });
  });

  it('persists fetched provider trends as current tenant-scoped trend documents', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));

    mockTiktokService.getTrends.mockResolvedValue([
      {
        growthRate: 81,
        mentions: 42500,
        metadata: {
          hashtags: ['#AIVideo'],
          sampleContent: 'Creators are remixing AI video demos.',
        },
        topic: 'AI video remix',
      },
    ]);
    mockApifyService.getInstagramTrends.mockResolvedValue([]);
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

    expect(mockTiktokService.getTrends).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
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

  describe('per-row trend persistence', () => {
    const instagramTrend = (topic: string | undefined) => ({
      growthRate: 10,
      mentions: 3,
      metadata: { hashtags: topic ? [topic] : [], source: 'apify' },
      platform: 'instagram',
      topic,
    });

    beforeEach(() => {
      mockPrisma.trend.create.mockImplementation(({ data }) =>
        Promise.resolve({ data, id: `trend-${data.topic}` }),
      );
    });

    it('skips an Instagram trend with no hashtag topic and saves the rest of the batch', async () => {
      mockApifyService.getInstagramTrends.mockResolvedValue([
        instagramTrend('reels'),
        instagramTrend(undefined),
        instagramTrend('  '),
        instagramTrend('fitness'),
      ]);

      const result = await service.fetchAndCacheTrends(
        undefined,
        undefined,
        undefined,
        { platforms: ['instagram'] },
      );

      expect(mockPrisma.trend.create).toHaveBeenCalledTimes(2);
      expect(result.map((trend) => trend.topic)).toEqual(['reels', 'fitness']);
      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.objectContaining({
          outcome: 'fallback_available',
          platform: 'instagram',
        }),
      ]);
    });

    it('records persistence failure when every Instagram row lacks a topic', async () => {
      mockApifyService.getInstagramTrends.mockResolvedValue([
        instagramTrend(undefined),
        instagramTrend(' '),
      ]);

      const result = await service.fetchAndCacheTrends(
        undefined,
        undefined,
        undefined,
        { platforms: ['instagram'] },
      );

      expect(result).toEqual([]);
      expect(mockPrisma.trend.create).not.toHaveBeenCalled();
      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.objectContaining({
          lastSuccessfulRefreshAt: null,
          outcome: 'fallback_failed',
          platform: 'instagram',
          reason: 'persistence_failed',
        }),
      ]);
    });

    it('keeps the rest of the batch when one row fails to save', async () => {
      mockApifyService.getInstagramTrends.mockResolvedValue([
        instagramTrend('reels'),
        instagramTrend('broken'),
        instagramTrend('fitness'),
      ]);
      mockPrisma.trend.create.mockImplementation(({ data }) =>
        data.topic === 'broken'
          ? Promise.reject(new Error('invalid row'))
          : Promise.resolve({ data, id: `trend-${data.topic}` }),
      );

      const result = await service.fetchAndCacheTrends(
        undefined,
        undefined,
        undefined,
        { platforms: ['instagram'] },
      );

      expect(mockPrisma.trend.create).toHaveBeenCalledTimes(3);
      expect(result.map((trend) => trend.topic)).toEqual(['reels', 'fitness']);
      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.not.objectContaining({ reason: 'persistence_failed' }),
      ]);
    });
  });

  describe('fetchPlatformTrends cost containment', () => {
    it('caches an empty result so a failing scrape does not re-run every call', async () => {
      await service.fetchPlatformTrends('tiktok');

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'trends:global:tiktok',
        [],
        expect.anything(),
      );
    });

    it('gives an empty result a shorter life than a successful one', async () => {
      await service.fetchPlatformTrends('tiktok');
      const [, , emptyOptions] = mockCacheService.set.mock.calls[0];

      mockCacheService.set.mockClear();
      mockApifyService.getInstagramTrends.mockResolvedValue([
        { growthRate: 10, mentions: 5, platform: 'instagram', topic: '#a' },
      ]);
      await service.fetchPlatformTrends('instagram');
      const [, , populatedOptions] = mockCacheService.set.mock.calls[0];

      expect(emptyOptions.ttl).toBeLessThan(populatedOptions.ttl);
    });

    it('holds global trends longer than the 30-minute corpus backfill interval', async () => {
      mockApifyService.getInstagramTrends.mockResolvedValue([
        { growthRate: 10, mentions: 5, platform: 'instagram', topic: '#a' },
      ]);

      await service.fetchPlatformTrends('instagram');

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
      expect(mockTiktokService.getTrends).not.toHaveBeenCalled();
    });

    it('keys the personalized cache by organization and brand', async () => {
      await service.fetchPlatformTrends('tiktok', 'org-1', 'brand-1');
      const personalizedKey = mockCacheService.set.mock.calls
        .map(([key]) => key)
        .find((key) => key.startsWith('trends:scoped:'));

      mockCacheService.set.mockClear();
      await service.fetchPlatformTrends('tiktok');
      const globalKey = mockCacheService.set.mock.calls
        .map(([key]) => key)
        .find((key) => key.startsWith('trends:global:'));

      expect(personalizedKey).toContain('org-1');
      expect(personalizedKey).toContain('brand-1');
      expect(personalizedKey).not.toEqual(globalKey);
    });
  });
  it.each([
    {
      native: [{ topic: 'News', mentions: 3, growthRate: 1 }],
      fallback: [],
      outcome: 'native_available',
      fails: false,
    },
    { native: [], fallback: [], outcome: 'native_empty', fails: false },
    { native: [], fallback: [], outcome: 'native_failed', fails: true },
  ])(
    'records scoped $outcome after completed refresh work',
    async ({ native, outcome, fails }) => {
      if (fails)
        mockYoutubeService.getTrends.mockRejectedValue(
          new Error('Bearer secret-provider-token'),
        );
      else
        mockYoutubeService.getTrends.mockResolvedValue(
          native.map((value) => ({
            ...value,
            title: value.topic,
            id: 'video',
            viewCount: 3,
            likeCount: 1,
            commentCount: 0,
          })),
        );
      mockPrisma.trend.create.mockImplementation(
        (input: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'trend', ...input.data }),
      );
      await service.fetchAndCacheTrends('org-1', 'brand-1', undefined, {
        allowApifyFallback: false,
        platforms: ['youtube'],
      });
      expect(refreshHealth.record).toHaveBeenCalledWith('org-1', [
        expect.objectContaining({
          dataset: 'trends',
          outcome,
          platform: 'youtube',
          scope: 'scoped',
          lastAttemptAt: expect.any(String),
        }),
      ]);
      const receipt = refreshHealth.record.mock.calls.at(-1)?.[1][0];
      expect(receipt.lastSuccessfulRefreshAt === null).toBe(fails);
      expect(JSON.stringify(receipt)).not.toContain('secret-provider-token');
    },
  );

  it('records a native failure for global Reddit and never claims a fallback', async () => {
    mockRedditService.getTrends.mockRejectedValue(
      new Error('native provider unavailable'),
    );

    await service.fetchAndCacheTrends(undefined, undefined, undefined, {
      platforms: ['reddit'],
    });

    expect(refreshHealth.record).toHaveBeenCalledWith(null, [
      expect.objectContaining({
        lastSuccessfulRefreshAt: null,
        outcome: 'native_failed',
        platform: 'reddit',
      }),
    ]);
  });

  it('records a global YouTube miss as a native failure and never as a fallback success', async () => {
    mockYoutubeService.getTrends.mockRejectedValue(
      new Error('native provider unavailable'),
    );
    const result = await service.fetchAndCacheTrends(
      undefined,
      undefined,
      undefined,
      { platforms: ['youtube'] },
    );
    expect(result).toEqual([]);
    expect(refreshHealth.record).toHaveBeenCalledWith(null, [
      expect.objectContaining({
        lastSuccessfulRefreshAt: null,
        outcome: 'native_failed',
        platform: 'youtube',
      }),
    ]);
  });

  it('does not advance an attempt when the provider result is already cached', async () => {
    mockCacheService.get.mockResolvedValue([]);
    await service.fetchAndCacheTrends(undefined, undefined, undefined, {
      platforms: ['youtube'],
    });
    expect(refreshHealth.record).toHaveBeenCalledWith(null, []);
    expect(mockYoutubeService.getTrends).not.toHaveBeenCalled();
  });

  it('records persistence failure without claiming a successful refresh', async () => {
    mockYoutubeService.getTrends.mockResolvedValue([
      {
        id: 'video',
        title: 'News',
        viewCount: 3,
        likeCount: 1,
        commentCount: 0,
      },
    ]);
    mockPrisma.trend.create.mockRejectedValue(
      new Error('database write failed with secret'),
    );
    await service.fetchAndCacheTrends(undefined, undefined, undefined, {
      platforms: ['youtube'],
    });
    expect(refreshHealth.record).toHaveBeenCalledWith(null, [
      expect.objectContaining({
        outcome: 'native_failed',
        reason: 'persistence_failed',
        lastSuccessfulRefreshAt: null,
      }),
    ]);
  });
  it('distinguishes integration-level swallowed failures from genuine empty native responses', async () => {
    mockYoutubeService.getTrends.mockImplementation(async () => {
      recordTrendProviderOutcome('native_failed', 'native_failed');
      return [];
    });
    await service.fetchAndCacheTrends('org-1', 'brand-1', undefined, {
      allowApifyFallback: false,
      platforms: ['youtube'],
    });
    expect(refreshHealth.record).toHaveBeenCalledWith('org-1', [
      expect.objectContaining({
        outcome: 'native_failed',
        reason: 'native_failed',
        lastSuccessfulRefreshAt: null,
      }),
    ]);
  });

  it('does not mark unavailable native credentials as a successful empty refresh', async () => {
    mockYoutubeService.getTrends.mockImplementation(async () => {
      recordTrendProviderOutcome('native_empty', 'native_unavailable');
      return [];
    });
    await service.fetchAndCacheTrends('org-1', 'brand-1', undefined, {
      allowApifyFallback: false,
      platforms: ['youtube'],
    });
    expect(refreshHealth.record).toHaveBeenCalledWith('org-1', [
      expect.objectContaining({
        outcome: 'native_empty',
        reason: 'native_unavailable',
        lastSuccessfulRefreshAt: null,
      }),
    ]);
  });

  describe.each([
    ['twitter', 'getTwitterTrends'],
    ['instagram', 'getInstagramTrends'],
  ] as const)('global %s Apify fallback evidence', (platform, method) => {
    it('records fallback_failed without a successful refresh when Apify throws', async () => {
      mockApifyService[method].mockRejectedValue(
        new Error('Apify actor run failed'),
      );

      await service.fetchAndCacheTrends(undefined, undefined, undefined, {
        platforms: [platform],
      });

      const receipt = refreshHealth.record.mock.calls.at(-1)?.[1][0];
      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.objectContaining({
          outcome: 'fallback_failed',
          platform,
          reason: 'provider_failed',
        }),
      ]);
      expect(receipt.lastSuccessfulRefreshAt).toBeNull();
    });

    it('records fallback_empty when Apify genuinely returns no trends', async () => {
      mockApifyService[method].mockResolvedValue([]);

      await service.fetchAndCacheTrends(undefined, undefined, undefined, {
        platforms: [platform],
      });

      expect(refreshHealth.record).toHaveBeenCalledWith(null, [
        expect.objectContaining({ outcome: 'fallback_empty', platform }),
      ]);
    });
  });

  it('records fallback_failed when Apify throws after Grok rejects every X trend', async () => {
    mockXaiService.getTrends.mockRejectedValue(new Error('Grok 402'));
    mockApifyService.getTwitterTrends.mockRejectedValue(new Error('blocked'));

    await expect(service.fetchTwitterTrends()).resolves.toEqual([]);

    expect(mockLoggerService.error).toHaveBeenCalled();
  });
});
