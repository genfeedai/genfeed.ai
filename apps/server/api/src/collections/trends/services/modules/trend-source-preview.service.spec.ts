import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendSourcePreviewService } from '@api/collections/trends/services/modules/trend-source-preview.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/services/cache.service';
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
  let cache: {
    generateKey: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };
  let apify: { [key: string]: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    apify = {
      searchInstagramByHashtag: vi.fn().mockResolvedValue([]),
      searchRedditPosts: vi.fn().mockResolvedValue([]),
      searchTikTokByHashtag: vi.fn().mockResolvedValue([]),
      searchTwitterTweets: vi.fn().mockResolvedValue([]),
      searchYouTubeVideos: vi.fn().mockResolvedValue([]),
    };
    cache = {
      generateKey: vi.fn((...args: unknown[]) => args.join(':')),
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendSourcePreviewService,
        TrendSourceItemsService,
        { provide: ApifyService, useValue: apify },
        {
          provide: PrismaService,
          useValue: {
            trend: {
              findFirst: vi.fn().mockResolvedValue(null),
              update: vi.fn(),
            },
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
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

      const [result] = await service.precomputeTrendSourcePreview([trend]);

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

      const [result] = await service.precomputeTrendSourcePreview([trend]);

      expect(result).toBe(trend);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves and persists a preview when the cache is empty', async () => {
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
      });

      expect(result.metadata?.sourcePreviewCache).toEqual([
        expect.objectContaining({ id: 'live-1' }),
      ]);
      expect(result.metadata?.sourcePreviewState).toBe('live');
    });
  });
});
