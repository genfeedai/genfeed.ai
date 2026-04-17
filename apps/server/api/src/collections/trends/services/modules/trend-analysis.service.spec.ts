import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

function createMockPrisma() {
  return {
    trend: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('TrendAnalysisService', () => {
  let service: TrendAnalysisService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockOrgId = 'org-id-1234';
  const mockBrandId = 'brand-id-5678';

  const makeTrendDoc = (
    overrides: Partial<TrendDocument & { data: unknown }> = {},
  ) => ({
    createdAt: new Date('2026-03-10T00:00:00Z'),
    data: {
      isCurrent: false,
      isDeleted: false,
      mentions: 1000,
      platform: 'tiktok',
      topic: 'AI',
      viralityScore: 70,
      ...((overrides.data as Record<string, unknown>) ?? {}),
    },
    id: 'trend-id-001',
    isDeleted: false,
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendAnalysisService,
        {
          provide: PrismaService,
          useValue: prisma,
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
    it('should call prisma.trend.updateMany with correct filter and return count', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markExpiredTrendsAsHistorical();

      expect(result).toBe(5);
      expect(prisma.trend.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isCurrent: false }),
          where: expect.objectContaining({
            expiresAt: expect.objectContaining({ lte: expect.any(Date) }),
            isCurrent: true,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should log the number of trends marked', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 3 });

      await service.markExpiredTrendsAsHistorical();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('3'),
        expect.objectContaining({ operation: 'markExpiredTrendsAsHistorical' }),
      );
    });

    it('should return 0 when no trends were updated', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markExpiredTrendsAsHistorical();

      expect(result).toBe(0);
    });

    it('should propagate errors from updateMany', async () => {
      prisma.trend.updateMany.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(service.markExpiredTrendsAsHistorical()).rejects.toThrow(
        'DB connection lost',
      );
    });
  });

  // ─── markCurrentTrendsAsHistorical ────────────────────────────────────────

  describe('markCurrentTrendsAsHistorical', () => {
    it('should scope query to organizationId and brandId when both provided', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 2 });

      await service.markCurrentTrendsAsHistorical(mockOrgId, mockBrandId);

      expect(prisma.trend.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: mockBrandId,
            isCurrent: true,
            isDeleted: false,
            organizationId: mockOrgId,
          }),
        }),
      );
    });

    it('should set organizationId to null when no organizationId provided', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 1 });

      await service.markCurrentTrendsAsHistorical();

      expect(prisma.trend.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: null }),
        }),
      );
    });

    it('should set brandId to null when no brandId provided', async () => {
      prisma.trend.updateMany.mockResolvedValue({ count: 1 });

      await service.markCurrentTrendsAsHistorical(mockOrgId);

      expect(prisma.trend.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ brandId: null }),
        }),
      );
    });
  });

  // ─── getHistoricalTrends ─────────────────────────────────────────────────

  describe('getHistoricalTrends', () => {
    it('should query with isCurrent=false and isDeleted=false', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      await service.getHistoricalTrends();

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isCurrent: false,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should apply platform filter when provided', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      await service.getHistoricalTrends({ platform: 'instagram' });

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: 'instagram' }),
        }),
      );
    });

    it('should apply topic contains filter when provided', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      await service.getHistoricalTrends({ topic: 'crypto' });

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            topic: expect.objectContaining({ contains: 'crypto' }),
          }),
        }),
      );
    });

    it('should apply date range when startDate and endDate provided', async () => {
      const startDate = new Date('2026-03-01');
      const endDate = new Date('2026-03-14');

      prisma.trend.findMany.mockResolvedValue([]);

      await service.getHistoricalTrends({ endDate, startDate });

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: startDate,
              lte: endDate,
            }),
          }),
        }),
      );
    });

    it('should default limit to 1000', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      await service.getHistoricalTrends();

      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1000 }),
      );
    });

    it('should map documents to TrendEntity instances', async () => {
      const doc = makeTrendDoc();
      prisma.trend.findMany.mockResolvedValue([doc]);

      const result = await service.getHistoricalTrends();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(TrendEntity);
    });
  });

  // ─── analyzeTrendPatterns ─────────────────────────────────────────────────

  describe('analyzeTrendPatterns', () => {
    it('should return zeroed result when no historical trends found', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

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
      const docs = [
        makeTrendDoc({
          data: { isCurrent: false, mentions: 5000, viralityScore: 80 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 5000, viralityScore: 80 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 100, viralityScore: 40 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 100, viralityScore: 40 },
        }),
      ].map((d, i) => ({ ...d, id: `trend-${i}` }));

      prisma.trend.findMany.mockResolvedValue(docs);

      const result = await service.analyzeTrendPatterns(
        'viral-topic',
        'tiktok',
      );

      expect(result.trendDirection).toBe('rising');
      expect(result.growthRate).toBeGreaterThan(10);
    });

    it('should classify falling trend when growthRate < -10', async () => {
      const docs = [
        makeTrendDoc({
          data: { isCurrent: false, mentions: 100, viralityScore: 20 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 100, viralityScore: 20 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 5000, viralityScore: 90 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 5000, viralityScore: 90 },
        }),
      ].map((d, i) => ({ ...d, id: `trend-${i}` }));

      prisma.trend.findMany.mockResolvedValue(docs);

      const result = await service.analyzeTrendPatterns(
        'fading-topic',
        'twitter',
      );

      expect(result.trendDirection).toBe('falling');
      expect(result.growthRate).toBeLessThan(-10);
    });

    it('should compute averageMentions and averageViralityScore correctly', async () => {
      const docs = [
        makeTrendDoc({
          data: { isCurrent: false, mentions: 200, viralityScore: 60 },
        }),
        makeTrendDoc({
          data: { isCurrent: false, mentions: 400, viralityScore: 80 },
        }),
      ].map((d, i) => ({ ...d, id: `trend-${i}` }));

      prisma.trend.findMany.mockResolvedValue(docs);

      const result = await service.analyzeTrendPatterns(
        'avg-topic',
        'instagram',
      );

      expect(result.averageMentions).toBe(300);
      expect(result.averageViralityScore).toBe(70);
    });

    it('should include peakMentions in result', async () => {
      const docs = [
        makeTrendDoc({
          createdAt: new Date('2026-03-11'),
          data: { isCurrent: false, mentions: 500, viralityScore: 50 },
        }),
        makeTrendDoc({
          createdAt: new Date('2026-03-12'),
          data: { isCurrent: false, mentions: 9000, viralityScore: 90 },
        }),
        makeTrendDoc({
          createdAt: new Date('2026-03-13'),
          data: { isCurrent: false, mentions: 300, viralityScore: 40 },
        }),
        makeTrendDoc({
          createdAt: new Date('2026-03-14'),
          data: { isCurrent: false, mentions: 200, viralityScore: 30 },
        }),
      ].map((d, i) => ({ ...d, id: `trend-${i}` }));

      prisma.trend.findMany.mockResolvedValue(docs);

      const result = await service.analyzeTrendPatterns(
        'peak-topic',
        'youtube',
      );

      expect(result.peakMentions).toBe(9000);
    });
  });
});
