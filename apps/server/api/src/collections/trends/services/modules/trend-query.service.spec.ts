import { TrendQueryService } from '@api/collections/trends/services/modules/trend-query.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';

type PrismaMock = {
  trend: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const makeDoc = (
  id: string,
  data: Record<string, unknown>,
  top: Record<string, unknown> = {},
) => ({
  brandId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  data: {
    expiresAt: future,
    isCurrent: true,
    platform: 'tiktok',
    topic: data.topic ?? 'topic',
    viralityScore: 50,
    ...data,
  },
  id,
  isDeleted: false,
  organizationId: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...top,
});

describe('TrendQueryService', () => {
  let service: TrendQueryService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      trend: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendQueryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TrendQueryService);
  });

  describe('findActiveTrends', () => {
    it('drops non-current and expired docs and sorts by virality desc', async () => {
      prisma.trend.findMany.mockResolvedValue([
        makeDoc('low', { viralityScore: 10 }),
        makeDoc('expired', { expiresAt: past, viralityScore: 99 }),
        makeDoc('stale', { isCurrent: false, viralityScore: 99 }),
        makeDoc('high', { viralityScore: 90 }),
      ]);

      const result = await service.findActiveTrends({
        brandId: null,
        organizationId: null,
      });

      expect(result.map((t) => String(t.id))).toEqual(['high', 'low']);
    });

    it('filters by platform when supplied', async () => {
      prisma.trend.findMany.mockResolvedValue([
        makeDoc('a', { platform: 'tiktok' }),
        makeDoc('b', { platform: 'youtube' }),
      ]);

      const result = await service.findActiveTrends({
        brandId: null,
        organizationId: null,
        platform: 'youtube',
      });

      expect(result.map((t) => String(t.id))).toEqual(['b']);
    });
  });

  describe('findLastGoodTrends', () => {
    it('keeps expired/non-current docs and breaks virality ties by recency', async () => {
      prisma.trend.findMany.mockResolvedValue([
        makeDoc(
          'older',
          { expiresAt: past, isCurrent: false, viralityScore: 70 },
          { createdAt: new Date('2026-01-01T00:00:00.000Z') },
        ),
        makeDoc(
          'newer',
          { expiresAt: past, isCurrent: false, viralityScore: 70 },
          { createdAt: new Date('2026-02-01T00:00:00.000Z') },
        ),
      ]);

      const result = await service.findLastGoodTrends({
        brandId: null,
        organizationId: null,
      });

      // both retained (no active filter); equal virality -> newer first
      expect(result.map((t) => String(t.id))).toEqual(['newer', 'older']);
    });
  });

  describe('getTrendById', () => {
    it('returns null when the doc belongs to another org', async () => {
      prisma.trend.findFirst.mockResolvedValue(
        makeDoc('x', {}, { organizationId: 'other-org' }),
      );

      const result = await service.getTrendById('x', 'my-org');

      expect(result).toBeNull();
    });

    it('returns the entity for a global trend', async () => {
      prisma.trend.findFirst.mockResolvedValue(
        makeDoc('x', { topic: 'global' }, { organizationId: null }),
      );

      const result = await service.getTrendById('x', 'my-org');

      expect(result).not.toBeNull();
      expect(String(result?.id)).toBe('x');
    });
  });

  describe('getBootstrapTrends', () => {
    it('returns the curated set, filtered by platform', () => {
      const all = service.getBootstrapTrends();
      const tiktok = service.getBootstrapTrends('tiktok');

      expect(all.length).toBeGreaterThan(1);
      expect(tiktok).toHaveLength(1);
      expect(tiktok[0]?.platform).toBe('tiktok');
    });
  });
});
