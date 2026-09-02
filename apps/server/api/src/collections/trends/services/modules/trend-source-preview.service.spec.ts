import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendSourcePreviewService } from '@api/collections/trends/services/modules/trend-source-preview.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const makeTrend = (overrides: Record<string, unknown> = {}): TrendEntity =>
  ({
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    id: 'trend-1',
    mentions: 1000,
    metadata: {},
    organizationId: null,
    platform: 'instagram',
    requiresAuth: false,
    topic: 'AI trends',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    viralityScore: 80,
    ...overrides,
  }) as unknown as TrendEntity;

describe('TrendSourcePreviewService', () => {
  let service: TrendSourcePreviewService;
  let sourceItems: TrendSourceItemsService;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let cache: {
    claimOnce: ReturnType<typeof vi.fn>;
    generateKey: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };
  let apify: { [key: string]: ReturnType<typeof vi.fn> };
  let prisma: {
    trend: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    apify = {
      searchInstagramByHashtag: vi.fn().mockResolvedValue([]),
      searchRedditPosts: vi.fn().mockResolvedValue([]),
      searchTikTokByHashtag: vi.fn().mockResolvedValue([]),
      searchTwitterTweets: vi.fn().mockResolvedValue([]),
      searchYouTubeVideos: vi.fn().mockResolvedValue([]),
    };
    cache = {
      claimOnce: vi.fn().mockResolvedValue('claimed'),
      generateKey: vi.fn((...args: unknown[]) => args.join(':')),
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue(true),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    prisma = {
      trend: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendSourcePreviewService,
        TrendSourceItemsService,
        { provide: ApifyService, useValue: apify },
        { provide: PrismaService, useValue: prisma },
        { provide: LoggerService, useValue: logger },
        { provide: CacheService, useValue: cache },
        {
          provide: TrendReferenceCorpusService,
          useValue: {
            annotateSourceItemsWithReferenceIds: vi.fn(async (items) => items),
          },
        },
      ],
    }).compile();

    service = module.get(TrendSourcePreviewService);
    sourceItems = module.get(TrendSourceItemsService);
  });

  describe('getAnnotatedSourceItems', () => {
    it('returns annotated live items when the fetch yields data', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([
        {
          contentType: 'post',
          id: 'live-1',
          platform: 'instagram',
          sourceUrl: 'https://live',
        },
      ]);

      const result = await service.getAnnotatedSourceItems(makeTrend(), 5);

      expect(result.map((i) => i.id)).toEqual(['live-1']);
    });

    it('falls back to synthesized items when the live fetch throws', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockRejectedValue(
        new Error('apify down'),
      );

      const trend = makeTrend({
        metadata: { sampleContent: 's', urls: ['https://fallback'] },
      });

      const result = await service.getAnnotatedSourceItems(trend, 5);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('trend-1-fallback-1');
    });
  });

  describe('getTrendContent', () => {
    const trendA = makeTrend({
      id: 'a',
      metadata: {
        sourcePreviewCache: [
          {
            contentType: 'post',
            id: 'a-1',
            platform: 'instagram',
            sourceUrl: 'https://a',
          },
        ],
        sourcePreviewState: 'live',
      },
      viralityScore: 90,
    });
    const trendB = makeTrend({
      id: 'b',
      metadata: {
        sourcePreviewCache: [
          {
            contentType: 'post',
            id: 'b-1',
            platform: 'instagram',
            sourceUrl: 'https://b',
          },
        ],
        sourcePreviewState: 'live',
      },
      viralityScore: 50,
    });

    it('returns the cached payload without loading access control', async () => {
      cache.get.mockResolvedValue({ items: ['cached'] });
      const loadAccessControl = vi.fn();

      const result = await service.getTrendContent({}, {}, loadAccessControl);

      expect(result).toEqual({ items: ['cached'] });
      expect(loadAccessControl).not.toHaveBeenCalled();
    });

    it('builds, ranks, and caches the feed on a cache miss', async () => {
      const loadAccessControl = vi.fn().mockResolvedValue({
        connectedPlatforms: [],
        lockedPlatforms: [],
        trends: [trendB, trendA],
      });

      const result = await service.getTrendContent(
        { organizationId: 'org' },
        { limit: 10 },
        loadAccessControl,
      );

      expect(result.items.map((i) => i.id)).toEqual(['a-1', 'b-1']);
      expect(result.items.map((i) => i.contentRank)).toEqual([1, 2]);
      expect(result.totalTrends).toBe(2);
      expect(cache.set).toHaveBeenCalledOnce();
    });

    it('hydrates a global preview without persisting it during a tenant refresh', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);
      const loadAccessControl = vi.fn().mockResolvedValue({
        connectedPlatforms: [],
        lockedPlatforms: [],
        trends: [makeTrend({ organizationId: null })],
      });

      const result = await service.getTrendContent(
        { organizationId: 'org-1' },
        { refresh: true },
        loadAccessControl,
      );

      expect(result.totalTrends).toBe(1);
      expect(prisma.trend.findFirst).not.toHaveBeenCalled();
      expect(prisma.trend.update).not.toHaveBeenCalled();
    });

    it('dedupes items that share a source url and unions matched trends', async () => {
      const shared = (id: string, topic: string, virality: number) =>
        makeTrend({
          id,
          metadata: {
            sourcePreviewCache: [
              {
                contentType: 'post',
                id: `${id}-1`,
                platform: 'instagram',
                sourceUrl: 'https://shared',
              },
            ],
            sourcePreviewState: 'live',
          },
          topic,
          viralityScore: virality,
        });

      const loadAccessControl = vi.fn().mockResolvedValue({
        connectedPlatforms: [],
        lockedPlatforms: [],
        trends: [shared('a', 'Topic A', 90), shared('b', 'Topic B', 50)],
      });

      const result = await service.getTrendContent({}, {}, loadAccessControl);

      expect(result.items).toHaveLength(1);
      expect([...result.items[0].matchedTrends].sort()).toEqual([
        'Topic A',
        'Topic B',
      ]);
    });
  });

  describe('precomputeTrendSourcePreview', () => {
    it('passes through trends on non-content-feed platforms untouched', async () => {
      const trend = makeTrend({ platform: 'pinterest' });

      const [result] = await service.precomputeTrendSourcePreview([trend], {
        writeScope: { organizationId: null },
      });

      expect(result).toBe(trend);
    });

    it('skips a content-feed trend that already has a cached preview (no force)', async () => {
      const fetchSpy = vi.spyOn(sourceItems, 'fetchTrendSourceItems');
      const trend = makeTrend({
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'post',
              id: 'cached-1',
              platform: 'instagram',
              sourceUrl: 'https://cached',
            },
          ],
        },
      });

      const [result] = await service.precomputeTrendSourcePreview([trend], {
        writeScope: { organizationId: null },
      });

      expect(result).toBe(trend);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves and persists a preview when the cache is empty', async () => {
      prisma.trend.findFirst.mockResolvedValue({
        data: { growthRate: 12, mentions: 800 },
      });
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([
        {
          contentType: 'post',
          id: 'live-1',
          platform: 'instagram',
          sourceUrl: 'https://live',
        },
      ]);
      const trend = makeTrend({ metadata: { hashtags: ['#AI'] } });

      const [result] = await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(result.metadata?.sourcePreviewCache).toEqual([
        expect.objectContaining({ id: 'live-1' }),
      ]);
      expect(result.metadata?.sourcePreviewState).toBe('live');
      expect(prisma.trend.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'trend-1',
          isDeleted: false,
          organizationId: null,
        },
      });
      expect(prisma.trend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            data: expect.objectContaining({
              growthRate: 12,
              metadata: expect.objectContaining({
                hashtags: ['#AI'],
                sourcePreviewCache: [expect.objectContaining({ id: 'live-1' })],
                sourcePreviewCachedAt: expect.any(String),
                sourcePreviewState: 'live',
              }),
              mentions: 800,
            }),
          },
          where: {
            id: 'trend-1',
            isDeleted: false,
            organizationId: null,
          },
        }),
      );
    });

    it('preserves tenant scope while persisting a preview', async () => {
      prisma.trend.findFirst.mockResolvedValue({ data: {} });
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);
      const trend = makeTrend({ organizationId: 'org-1' });

      await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: 'org-1' },
      });

      const expectedWhere = {
        id: 'trend-1',
        isDeleted: false,
        organizationId: 'org-1',
      };
      expect(prisma.trend.findFirst).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prisma.trend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            data: expect.objectContaining({
              metadata: expect.objectContaining({
                sourcePreviewCache: [],
                sourcePreviewCachedAt: expect.any(String),
                sourcePreviewState: 'empty',
              }),
            }),
          },
          where: expectedWhere,
        }),
      );
    });

    it('hydrates a global trend without persisting outside the tenant write scope', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);
      const trend = makeTrend({ organizationId: null });

      const [result] = await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: 'org-1' },
      });

      expect(result.metadata?.sourcePreviewState).toBe('empty');
      expect(prisma.trend.findFirst).not.toHaveBeenCalled();
      expect(prisma.trend.update).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'missing', organizationId: undefined },
      { label: 'empty', organizationId: '' },
    ])(
      'rejects a $label organization scope instead of treating it as global',
      async ({ organizationId }) => {
        vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);
        // Runtime entities can be malformed despite the stricter TrendEntity type.
        const trend = makeTrend({ organizationId });

        await expect(
          service.precomputeTrendSourcePreview([trend], {
            force: true,
            writeScope: { organizationId: null },
          }),
        ).rejects.toThrow('scopedWhere: organizationId is required');
        expect(prisma.trend.findFirst).not.toHaveBeenCalled();
        expect(prisma.trend.update).not.toHaveBeenCalled();
      },
    );

    it('warns and skips the update when the scoped trend row is missing', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);
      const trend = makeTrend({ organizationId: 'org-1' });

      await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: 'org-1' },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Skipped trend source preview persistence because the trend row was not found',
        { organizationId: 'org-1', trendId: 'trend-1' },
      );
      expect(prisma.trend.update).not.toHaveBeenCalled();
    });
  });

  describe('precomputeTrendSourcePreview cost containment', () => {
    const makeUncachedTrends = (count: number): TrendEntity[] =>
      Array.from({ length: count }, (_, index) =>
        makeTrend({ id: `trend-${index}`, metadata: { hashtags: ['#AI'] } }),
      );

    it('leaves a recently cached preview alone even when force is set', async () => {
      const fetchSpy = vi.spyOn(sourceItems, 'fetchTrendSourceItems');
      const trend = makeTrend({
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'post',
              id: 'cached-1',
              platform: 'instagram',
              sourceUrl: 'https://cached',
            },
          ],
          sourcePreviewCachedAt: new Date().toISOString(),
        },
      });

      const [result] = await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(result).toBe(trend);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('re-fetches a forced preview once it is older than the refresh floor', async () => {
      const fetchSpy = vi
        .spyOn(sourceItems, 'fetchTrendSourceItems')
        .mockResolvedValue([]);
      const trend = makeTrend({
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'post',
              id: 'cached-1',
              platform: 'instagram',
              sourceUrl: 'https://cached',
            },
          ],
          sourcePreviewCachedAt: new Date(
            Date.now() - 48 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });

      await service.precomputeTrendSourcePreview([trend], {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('caps how many trends can trigger a live Apify run in one batch', async () => {
      const fetchSpy = vi
        .spyOn(sourceItems, 'fetchTrendSourceItems')
        .mockResolvedValue([]);

      const trends = makeUncachedTrends(40);
      const results = await service.precomputeTrendSourcePreview(trends, {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(results).toHaveLength(trends.length);
      expect(fetchSpy.mock.calls.length).toBeLessThan(trends.length);
    });

    it('logs the trends it skipped instead of silently truncating the batch', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);

      await service.precomputeTrendSourcePreview(makeUncachedTrends(40), {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(logger.warn).toHaveBeenCalled();
    });

    it('never runs the capped fetches all at once', async () => {
      let inFlight = 0;
      let peak = 0;
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockImplementation(
        async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 0));
          inFlight -= 1;
          return [];
        },
      );

      await service.precomputeTrendSourcePreview(makeUncachedTrends(40), {
        force: true,
        writeScope: { organizationId: null },
      });

      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(4);
    });
  });

  describe('getTrendContent refresh cooldown', () => {
    const uncachedTrend = () =>
      makeTrend({ metadata: { hashtags: ['#AI'] }, organizationId: null });

    it('serves the cached payload when the scope already refreshed recently', async () => {
      cache.claimOnce.mockResolvedValue('duplicate');
      cache.get.mockResolvedValue({
        connectedPlatforms: [],
        items: [],
        latestTrendAt: null,
        lockedPlatforms: [],
        totalTrends: 0,
      });
      const fetchSpy = vi
        .spyOn(sourceItems, 'fetchTrendSourceItems')
        .mockResolvedValue([]);

      await service.getTrendContent(
        { organizationId: 'org-1' },
        { refresh: true },
        vi.fn().mockResolvedValue({
          connectedPlatforms: [],
          lockedPlatforms: [],
          trends: [uncachedTrend()],
        }),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('claims the cooldown before spending Apify runs on a refresh', async () => {
      vi.spyOn(sourceItems, 'fetchTrendSourceItems').mockResolvedValue([]);

      await service.getTrendContent(
        { organizationId: 'org-1' },
        { refresh: true },
        vi.fn().mockResolvedValue({
          connectedPlatforms: [],
          lockedPlatforms: [],
          trends: [uncachedTrend()],
        }),
      );

      expect(cache.claimOnce).toHaveBeenCalledTimes(1);
      const [key, ttl] = cache.claimOnce.mock.calls[0];
      expect(key).toContain('org-1');
      expect(ttl).toBeGreaterThan(0);
    });

    it('does not claim a cooldown for a plain read', async () => {
      await service.getTrendContent(
        { organizationId: 'org-1' },
        {},
        vi.fn().mockResolvedValue({
          connectedPlatforms: [],
          lockedPlatforms: [],
          trends: [],
        }),
      );

      expect(cache.claimOnce).not.toHaveBeenCalled();
    });

    it('still refreshes when the cooldown cannot be claimed because Redis is down', async () => {
      cache.claimOnce.mockResolvedValue('unavailable');
      const fetchSpy = vi
        .spyOn(sourceItems, 'fetchTrendSourceItems')
        .mockResolvedValue([]);

      await service.getTrendContent(
        { organizationId: 'org-1' },
        { refresh: true },
        vi.fn().mockResolvedValue({
          connectedPlatforms: [],
          lockedPlatforms: [],
          trends: [uncachedTrend()],
        }),
      );

      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
