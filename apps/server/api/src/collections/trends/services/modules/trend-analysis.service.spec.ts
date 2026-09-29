import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { Test, TestingModule } from '@nestjs/testing';

function createMockPrisma() {
  return {
    trend: {
      findMany: vi
        .fn<(args: unknown) => PromiseLike<unknown[]>>()
        .mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function createLazyResult<T>(execute: () => T): PromiseLike<T> {
  return {
    // biome-ignore lint/suspicious/noThenProperty: PrismaPromise executes lazily through its then method.
    then: (onfulfilled, onrejected) =>
      Promise.resolve().then(execute).then(onfulfilled, onrejected),
  };
}

describe('TrendAnalysisService', () => {
  let service: TrendAnalysisService;
  let prisma: ReturnType<typeof createMockPrisma>;

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

    vi.clearAllMocks();
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
  });

  // ─── getHistoricalTrends ─────────────────────────────────────────────────

  describe('getHistoricalTrends', () => {
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

    it('should map documents to TrendEntity instances', async () => {
      const doc = makeTrendDoc();
      prisma.trend.findMany.mockResolvedValue([doc]);

      const result = await service.getHistoricalTrends();

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(TrendEntity);
    });

    it('opens the reviewed hatch for a global corpus read under tenant context', async () => {
      let hatchWasOpen = false;
      prisma.trend.findMany.mockImplementation((args) =>
        createLazyResult(() => {
          hatchWasOpen = isCrossOrgUnsafe();
          assertTenantScopedQuery({
            args,
            isCloud: true,
            model: 'Trend',
            operation: 'findMany',
            tenantModelNames: new Set(['Trend']),
          });
          return [];
        }),
      );

      await expect(
        runWithTenantContext({ organizationId: mockOrgId }, () =>
          service.getHistoricalTrends(),
        ),
      ).resolves.toEqual([]);
      expect(hatchWasOpen).toBe(true);
    });

    it('keeps an explicitly tenant-scoped corpus read inside the runtime guard', async () => {
      let hatchWasOpen = false;
      prisma.trend.findMany.mockImplementation((args) =>
        createLazyResult(() => {
          hatchWasOpen = isCrossOrgUnsafe();
          assertTenantScopedQuery({
            args,
            isCloud: true,
            model: 'Trend',
            operation: 'findMany',
            tenantModelNames: new Set(['Trend']),
          });
          return [];
        }),
      );

      await expect(
        runWithTenantContext({ organizationId: mockOrgId }, () =>
          service.getHistoricalTrends({ organizationId: mockOrgId }),
        ),
      ).resolves.toEqual([]);
      expect(hatchWasOpen).toBe(false);
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
  });
});
