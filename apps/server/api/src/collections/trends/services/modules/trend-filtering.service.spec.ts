import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  TrendData,
  TrendPreferencesFilter,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const makeTrend = (overrides: Partial<TrendEntity> = {}): TrendEntity =>
  ({
    growthRate: 20,
    id: 'trend-id-1',
    mentions: 1000,
    metadata: { hashtags: [] },
    platform: 'tiktok',
    topic: 'test topic',
    viralityScore: 50,
    ...overrides,
  }) as unknown as TrendEntity;

describe('TrendFilteringService', () => {
  let service: TrendFilteringService;
  let prisma: { trend: { findMany: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = {
      trend: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendFilteringService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TrendFilteringService>(TrendFilteringService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── calculateViralityScore ────────────────────────────────────────────────

  describe('calculateViralityScore', () => {
    it('should return 0 for zero-value trend', () => {
      const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const trend: TrendData = {
        createdAt: oldDate,
        growthRate: 0,
        mentions: 0,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(0);
    });

    it('should cap at 100 for extreme values', () => {
      const trend: TrendData = {
        createdAt: new Date().toISOString(),
        growthRate: 999,
        mentions: 100_000_000,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(100);
    });

    it('should weight mentions at 0.5, growthRate at 0.3, recency at 0.2', () => {
      const trend: TrendData = {
        createdAt: new Date().toISOString(),
        growthRate: 100,
        mentions: 5_000_000,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(75);
    });

    it('should give 0 recency for trends older than 30 minutes', () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      const trend: TrendData = {
        createdAt: thirtyOneMinutesAgo.toISOString(),
        growthRate: 0,
        mentions: 0,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(0);
    });

    it('should handle missing createdAt (treat as brand-new for recency)', () => {
      const trend: TrendData = {
        growthRate: 0,
        mentions: 0,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(20);
    });
  });

  // ─── filterTrendsByBrandDescription ───────────────────────────────────────

  describe('filterTrendsByBrandDescription', () => {
    const trends = [
      makeTrend({ topic: 'fitness workout tips' }),
      makeTrend({ topic: 'cooking recipes pasta' }),
      makeTrend({ topic: 'travel destinations europe' }),
    ];

    it('should return all trends when brandDescription is empty', () => {
      expect(service.filterTrendsByBrandDescription(trends, '')).toHaveLength(
        3,
      );
    });

    it('should return all trends when brandDescription has only common words', () => {
      expect(
        service.filterTrendsByBrandDescription(trends, 'the and or but'),
      ).toHaveLength(3);
    });

    it('should prioritise matching trends when keywords match', () => {
      const result = service.filterTrendsByBrandDescription(
        trends,
        'fitness training and workout',
      );
      expect(result[0].topic).toBe('fitness workout tips');
    });

    it('should fall back to original list when no keywords match', () => {
      const result = service.filterTrendsByBrandDescription(
        trends,
        'quantum physics semiconductor',
      );
      expect(result).toHaveLength(3);
    });
  });

  // ─── filterTrendsByPreferences ────────────────────────────────────────────

  describe('filterTrendsByPreferences', () => {
    const trends = [
      makeTrend({
        platform: 'tiktok',
        topic: 'ai technology news',
        viralityScore: 80,
      }),
      makeTrend({
        platform: 'instagram',
        topic: 'sports highlights basketball',
        viralityScore: 60,
      }),
      makeTrend({
        metadata: { hashtags: ['#vegan'] },
        platform: 'youtube',
        topic: 'cooking vegan meals',
        viralityScore: 40,
      }),
    ];

    it('should return all trends when preferences is null/undefined', () => {
      expect(
        service.filterTrendsByPreferences(
          trends,
          null as unknown as TrendPreferencesFilter,
        ),
      ).toHaveLength(3);
    });

    it('should return all trends when preferences has no filters set', () => {
      const prefs: TrendPreferencesFilter = {} as TrendPreferencesFilter;
      expect(service.filterTrendsByPreferences(trends, prefs)).toHaveLength(3);
    });

    it('should filter by keyword and boost matching trends', () => {
      const prefs: TrendPreferencesFilter = {
        keywords: ['ai', 'technology'],
      } as TrendPreferencesFilter;
      const result = service.filterTrendsByPreferences(trends, prefs);
      expect(result[0].topic).toContain('ai');
    });

    it('should exclude trends from non-preferred platforms', () => {
      const prefs: TrendPreferencesFilter = {
        platforms: ['tiktok'],
      } as TrendPreferencesFilter;
      const result = service.filterTrendsByPreferences(trends, prefs);
      expect(result.every((t) => t.platform === 'tiktok')).toBe(true);
    });

    it('should match hashtags with higher weight than keywords', () => {
      const prefs: TrendPreferencesFilter = {
        hashtags: ['#vegan'],
      } as TrendPreferencesFilter;
      const result = service.filterTrendsByPreferences(trends, prefs);
      expect(result[0].topic).toContain('vegan');
    });
  });

  // ─── getRelatedTrends ─────────────────────────────────────────────────────

  describe('getRelatedTrends', () => {
    it('should return empty array when topic has no meaningful keywords', async () => {
      const result = await service.getRelatedTrends('in on at', 'tiktok');
      expect(result).toEqual([]);
      expect(prisma.trend.findMany).not.toHaveBeenCalled();
    });

    it('should call prisma.trend.findMany with platform exclusion', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      await service.getRelatedTrends(
        'ai content creator',
        'instagram',
        'org-1',
      );

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            platform: expect.objectContaining({ not: 'instagram' }),
          }),
        }),
      );
    });

    it('should map documents to TrendEntity instances', async () => {
      const rawDoc = {
        createdAt: new Date(),
        data: {
          isCurrent: true,
          platform: 'tiktok',
          topic: 'ai news',
          viralityScore: 70,
        },
        id: 'trend-xyz',
        isDeleted: false,
        organizationId: null,
        topic: 'ai news',
        updatedAt: new Date(),
        viralityScore: 70,
      };
      prisma.trend.findMany.mockResolvedValue([rawDoc]);

      const results = await service.getRelatedTrends(
        'trending news today',
        'instagram',
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(TrendEntity);
    });
  });
});
