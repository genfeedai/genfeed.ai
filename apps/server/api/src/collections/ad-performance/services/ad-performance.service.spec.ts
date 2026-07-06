import type { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockAdPerformanceDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

const buildRecord = (
  overrides: Partial<AdPerformance> & { data?: Record<string, unknown> } = {},
): AdPerformance =>
  ({
    adPlatform: 'meta',
    brandId: null,
    conversionRate: 0.08,
    cpa: 12,
    cpc: 1.5,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    credentialId: null,
    ctr: 0.04,
    ctaPatternCategories: [],
    ctaText: 'Shop now',
    data: {},
    dataConfidence: 0.9,
    headlinePatternCategories: [],
    headlineText: 'Save 20 today',
    id: 'ad-1',
    industry: 'fitness',
    isDeleted: false,
    mongoId: null,
    organizationId: 'org-1',
    performanceScore: 80,
    roas: 2.4,
    scope: 'public',
    spend: 150,
    spendBucket: '$50-200/day',
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  }) as AdPerformance;

describe('AdPerformanceService', () => {
  let adPerformance: MockAdPerformanceDelegate;
  let service: AdPerformanceService;

  beforeEach(() => {
    adPerformance = {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    };
    service = new AdPerformanceService({
      adPerformance,
    } as unknown as PrismaService);
  });

  describe('findTopPerformers', () => {
    it('pushes platform, industry, scope, metric ordering, and limit into Prisma', async () => {
      adPerformance.findMany.mockResolvedValue([
        buildRecord({ id: 'ad-roas', roas: 3.1 }),
      ]);

      const result = await service.findTopPerformers({
        adPlatform: 'meta',
        industry: 'fitness',
        limit: 3,
        metric: 'roas',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [{ roas: 'desc' }, { updatedAt: 'desc' }],
        take: 3,
        where: {
          adPlatform: 'meta',
          industry: 'fitness',
          isDeleted: false,
          roas: { not: null },
          scope: 'public',
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ad-roas');
    });

    it('defaults to performanceScore and a ten-row Prisma limit', async () => {
      await service.findTopPerformers({});

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [{ performanceScore: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
        where: {
          isDeleted: false,
          performanceScore: { not: null },
        },
      });
    });

    it('uses a bounded candidate query for JSON-backed metrics', async () => {
      adPerformance.findMany.mockResolvedValue([
        buildRecord({
          data: { conversions: 1 },
          id: 'low-conversions',
          performanceScore: 99,
        }),
        buildRecord({
          data: { conversions: 15 },
          id: 'high-conversions',
          performanceScore: 70,
        }),
      ]);

      const result = await service.findTopPerformers({
        limit: 1,
        metric: 'conversions',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [{ performanceScore: 'desc' }, { updatedAt: 'desc' }],
        take: 500,
        where: {
          isDeleted: false,
          performanceScore: { not: null },
          scope: 'public',
        },
      });
      expect(result.map((record) => record.id)).toEqual(['high-conversions']);
    });

    it('does not query when the requested limit is zero', async () => {
      const result = await service.findTopPerformers({ limit: 0 });

      expect(result).toEqual([]);
      expect(adPerformance.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findPublicById', () => {
    it('requires public scope for public ad detail lookups', async () => {
      adPerformance.findFirst.mockResolvedValue(
        buildRecord({ id: 'public-ad' }),
      );

      const result = await service.findPublicById('public-ad');

      expect(adPerformance.findFirst).toHaveBeenCalledWith({
        where: { id: 'public-ad', isDeleted: false, scope: 'public' },
      });
      expect(result?.id).toBe('public-ad');
    });
  });
});
