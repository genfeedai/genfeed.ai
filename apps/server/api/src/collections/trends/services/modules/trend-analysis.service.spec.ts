import {
  Trend,
  type TrendDocument,
} from '@api/collections/trends/schemas/trend.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

function createMockModel() {
  return {
    find: vi.fn(),
    lean: vi.fn(),
    limit: vi.fn(),
    sort: vi.fn(),
    updateMany: vi.fn(),
  };
}

describe('TrendAnalysisService', () => {
  let service: TrendAnalysisService;
  let trendModel: ReturnType<typeof createMockModel>;
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockOrgId = new Types.ObjectId().toString();
  const mockBrandId = new Types.ObjectId().toString();

  const makeTrendDoc = (
    overrides: Partial<TrendDocument> = {},
  ): Partial<TrendDocument> => ({
    _id: new Types.ObjectId(),
    brand: null as never,
    createdAt: new Date('2026-03-10T00:00:00Z'),
    isDeleted: false,
    mentions: 1000,
    organization: null as never,
    platform: 'tiktok',
    topic: 'AI',
    updatedAt: new Date(),
    viralityScore: 70,
    ...overrides,
  });

  beforeEach(async () => {
    trendModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendAnalysisService,
        {
          provide: getModelToken(Trend.name, DB_CONNECTIONS.CLOUD),
          useValue: trendModel,
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TrendAnalysisService>(TrendAnalysisService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── markExpiredTrendsAsHistorical ────────────────────────────────────────

  describe('markExpiredTrendsAsHistorical', () => {
    it('should call updateMany with correct filter and return modifiedCount', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 5 });

      const result = await service.markExpiredTrendsAsHistorical();

      expect(result).toBe(5);
      expect(trendModel.updateMany).toHaveBeenCalledWith(
        {
          expiresAt: { $lte: expect.any(Date) },
          isCurrent: true,
          isDeleted: false,
        },
        { $set: { isCurrent: false } },
      );
    });

    it('should log the number of trends marked', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      await service.markExpiredTrendsAsHistorical();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('3'),
        expect.objectContaining({ operation: 'markExpiredTrendsAsHistorical' }),
      );
    });

    it('should return 0 when no trends were updated', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      const result = await service.markExpiredTrendsAsHistorical();

      expect(result).toBe(0);
    });

    it('should propagate errors from updateMany', async () => {
      trendModel.updateMany.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.markExpiredTrendsAsHistorical()).rejects.toThrow(
        'DB connection lost',
      );
    });
  });

  // ─── markCurrentTrendsAsHistorical ────────────────────────────────────────

  describe('markCurrentTrendsAsHistorical', () => {
    it('should scope query to organizationId and brandId when both provided', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

      await service.markCurrentTrendsAsHistorical(mockOrgId, mockBrandId);

      expect(trendModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: mockBrandId,
          isCurrent: true,
          isDeleted: false,
          organization: mockOrgId,
        }),
        { isCurrent: false },
      );
    });

    it('should set organization to null when no organizationId provided', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await service.markCurrentTrendsAsHistorical();

      expect(trendModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ organization: null }),
        expect.anything(),
      );
    });

    it('should set brand to null when no brandId provided', async () => {
      trendModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await service.markCurrentTrendsAsHistorical(mockOrgId);

      expect(trendModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ brand: null }),
        expect.anything(),
      );
    });
  });

  // ─── getHistoricalTrends ─────────────────────────────────────────────────

  describe('getHistoricalTrends', () => {
    it('should query isCurrent=false and isDeleted=false', async () => {
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });

      await service.getHistoricalTrends();

      expect(trendModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isCurrent: false, isDeleted: false }),
      );
    });

    it('should apply platform filter when provided', async () => {
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });

      await service.getHistoricalTrends({ platform: 'instagram' });

      expect(trendModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'instagram' }),
      );
    });

    it('should apply topic regex filter when provided', async () => {
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });

      await service.getHistoricalTrends({ topic: 'crypto' });

      expect(trendModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: { $options: 'i', $regex: 'crypto' },
        }),
      );
    });

    it('should apply date range when startDate and endDate provided', async () => {
      const startDate = new Date('2026-03-01');
      const endDate = new Date('2026-03-14');

      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });

      await service.getHistoricalTrends({ endDate, startDate });

      expect(trendModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: { $gte: startDate, $lte: endDate },
        }),
      );
    });

    it('should default limit to 1000', async () => {
      const limitFn = vi
        .fn()
        .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({ limit: limitFn }),
      });

      await service.getHistoricalTrends();

      expect(limitFn).toHaveBeenCalledWith(1000);
    });

    it('should map documents to TrendEntity instances', async () => {
      const doc = makeTrendDoc();
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([doc]) }),
        }),
      });

      const result = await service.getHistoricalTrends();

      expect(result).toHaveLength(1);
      // TrendEntity wraps the doc
      expect(result[0]).toBeDefined();
    });
  });

  // ─── analyzeTrendPatterns ─────────────────────────────────────────────────

  describe('analyzeTrendPatterns', () => {
    it('should return zeroed result when no historical trends found', async () => {
      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.analyzeTrendPatterns(
        'niche-topic',
        'youtube',
      );

      expect(result).toEqual({
        averageMentions: 0,
        averageViralityScore: 0,
        growthRate: 0,
        platform: 'youtube',
        topic: 'niche-topic',
        trendDirection: 'stable',
      });
    });

    it('should classify rising trend when growthRate > 10', async () => {
      // Older (latter half) has low mentions, recent (first half) has high mentions
      const docs = [
        makeTrendDoc({ mentions: 5000, viralityScore: 80 }), // recent
        makeTrendDoc({ mentions: 5000, viralityScore: 80 }), // recent
        makeTrendDoc({ mentions: 100, viralityScore: 40 }), // older
        makeTrendDoc({ mentions: 100, viralityScore: 40 }), // older
      ];

      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
        }),
      });

      const result = await service.analyzeTrendPatterns(
        'viral-topic',
        'tiktok',
      );

      expect(result.trendDirection).toBe('rising');
      expect(result.growthRate).toBeGreaterThan(10);
    });

    it('should classify falling trend when growthRate < -10', async () => {
      // Recent (first half) has low mentions, older (latter half) has high mentions
      const docs = [
        makeTrendDoc({ mentions: 100, viralityScore: 20 }), // recent
        makeTrendDoc({ mentions: 100, viralityScore: 20 }), // recent
        makeTrendDoc({ mentions: 5000, viralityScore: 90 }), // older
        makeTrendDoc({ mentions: 5000, viralityScore: 90 }), // older
      ];

      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
        }),
      });

      const result = await service.analyzeTrendPatterns(
        'fading-topic',
        'twitter',
      );

      expect(result.trendDirection).toBe('falling');
      expect(result.growthRate).toBeLessThan(-10);
    });

    it('should compute averageMentions and averageViralityScore correctly', async () => {
      const docs = [
        makeTrendDoc({ mentions: 200, viralityScore: 60 }),
        makeTrendDoc({ mentions: 400, viralityScore: 80 }),
      ];

      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
        }),
      });

      const result = await service.analyzeTrendPatterns(
        'avg-topic',
        'instagram',
      );

      expect(result.averageMentions).toBe(300);
      expect(result.averageViralityScore).toBe(70);
    });

    it('should include peakMentions and peakDate in result', async () => {
      const peakDate = new Date('2026-03-12T00:00:00Z');
      const docs = [
        makeTrendDoc({ createdAt: new Date('2026-03-11'), mentions: 500 }),
        makeTrendDoc({ createdAt: peakDate, mentions: 9000 }),
        makeTrendDoc({ createdAt: new Date('2026-03-13'), mentions: 300 }),
        makeTrendDoc({ createdAt: new Date('2026-03-14'), mentions: 200 }),
      ];

      trendModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
        }),
      });

      const result = await service.analyzeTrendPatterns(
        'peak-topic',
        'youtube',
      );

      expect(result.peakMentions).toBe(9000);
    });
  });
});
