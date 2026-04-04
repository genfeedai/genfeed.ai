import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  TrendData,
  TrendPreferencesFilter,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { Trend } from '@api/collections/trends/schemas/trend.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TrendFilteringService } from './trend-filtering.service';

const makeTrend = (overrides: Partial<TrendEntity> = {}): TrendEntity =>
  ({
    _id: new Types.ObjectId(),
    growthRate: 20,
    mentions: 1000,
    metadata: { hashtags: [] },
    platform: 'tiktok',
    topic: 'test topic',
    viralityScore: 50,
    ...overrides,
  }) as unknown as TrendEntity;

describe('TrendFilteringService', () => {
  let service: TrendFilteringService;
  let trendModel: { find: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const mockFind = vi.fn();
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([]),
      limit: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    };
    mockFind.mockReturnValue(mockQuery);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendFilteringService,
        {
          provide: getModelToken(Trend.name, DB_CONNECTIONS.CLOUD),
          useValue: { find: mockFind },
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
    trendModel = module.get(getModelToken(Trend.name, DB_CONNECTIONS.CLOUD));
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
      // Use a date >30min ago so recency decays to 0
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
        createdAt: new Date().toISOString(), // brand-new
        growthRate: 999,
        mentions: 100_000_000,
      } as TrendData;
      expect(service.calculateViralityScore(trend)).toBe(100);
    });

    it('should weight mentions at 0.5, growthRate at 0.3, recency at 0.2', () => {
      // mentions = 5M → normalised = 50 → contribution = 25
      // growthRate = 100 → contribution = 30
      // brand-new → recency = 100 → contribution = 20
      // total = 75
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
      // recency = 100 * 0.2 = 20
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
      expect(trendModel.find).not.toHaveBeenCalled();
    });

    it('should query with platform exclusion and org filter when organizationId is provided', async () => {
      const mockLean = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
      trendModel.find.mockReturnValue({ sort: mockSort });

      await service.getRelatedTrends(
        'ai content creator',
        'instagram',
        new Types.ObjectId().toHexString(),
      );

      expect(trendModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.any(Array),
          isCurrent: true,
          isDeleted: false,
          platform: { $ne: 'instagram' },
        }),
      );
    });

    it('should map documents to TrendEntity instances', async () => {
      const rawDoc = {
        _id: new Types.ObjectId(),
        platform: 'tiktok',
        topic: 'ai news',
        viralityScore: 70,
      };
      const mockLean = vi.fn().mockResolvedValue([rawDoc]);
      const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
      trendModel.find.mockReturnValue({ sort: mockSort });

      const results = await service.getRelatedTrends(
        'ai technology',
        'instagram',
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(TrendEntity);
    });
  });
});
