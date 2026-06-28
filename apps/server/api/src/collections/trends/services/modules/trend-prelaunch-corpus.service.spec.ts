import { TrendPrelaunchCorpusService } from '@api/collections/trends/services/modules/trend-prelaunch-corpus.service';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrendPrelaunchCorpusService', () => {
  let service: TrendPrelaunchCorpusService;
  let prisma: {
    trend: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let referenceCorpus: {
    countGlobalReferences: ReturnType<typeof vi.fn>;
    syncTrendReferences: ReturnType<typeof vi.fn>;
  };
  let cache: { invalidateByTags: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      trend: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };
    referenceCorpus = {
      countGlobalReferences: vi.fn().mockResolvedValue(7),
      syncTrendReferences: vi
        .fn()
        .mockResolvedValue({ links: 0, references: 0, snapshots: 0 }),
    };
    cache = { invalidateByTags: vi.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendPrelaunchCorpusService,
        TrendSourceItemsService,
        { provide: ApifyService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: CacheService, useValue: cache },
        { provide: TrendReferenceCorpusService, useValue: referenceCorpus },
      ],
    }).compile();

    service = module.get(TrendPrelaunchCorpusService);
  });

  describe('getGlobalCorpusStats', () => {
    it('counts only current, unexpired global trends', async () => {
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      prisma.trend.findMany.mockResolvedValue([
        { data: { expiresAt: future, isCurrent: true } },
        { data: { expiresAt: past, isCurrent: true } }, // expired
        { data: { expiresAt: future, isCurrent: false } }, // not current
      ]);

      const result = await service.getGlobalCorpusStats();

      expect(result).toEqual({ activeTrends: 1, referenceRecords: 7 });
    });
  });

  describe('backfillPrelaunchReferenceCorpus', () => {
    it('plans creates without writing in dry-run mode (the default)', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      const result = await service.backfillPrelaunchReferenceCorpus({
        now: new Date('2026-06-09T00:00:00.000Z'),
      });

      expect(result.dryRun).toBe(true);
      expect(result.plannedCreates).toBe(result.seedTrends);
      expect(result.plannedUpdates).toBe(0);
      expect(result.createdTrends).toBe(0);
      expect(prisma.trend.create).not.toHaveBeenCalled();
      expect(prisma.trend.update).not.toHaveBeenCalled();
      expect(referenceCorpus.syncTrendReferences).not.toHaveBeenCalled();
      expect(cache.invalidateByTags).not.toHaveBeenCalled();
    });

    it('creates seeds, syncs references, and busts caches in live mode', async () => {
      prisma.trend.findMany.mockResolvedValue([]);
      prisma.trend.create.mockImplementation(async (input: unknown) => {
        const payload = input as { data: { data: Record<string, unknown> } };
        return {
          brandId: null,
          createdAt: new Date('2026-06-09T00:00:00.000Z'),
          data: payload.data.data,
          id: `created-${prisma.trend.create.mock.calls.length}`,
          isDeleted: false,
          organizationId: null,
          updatedAt: new Date('2026-06-09T00:00:00.000Z'),
        };
      });

      const result = await service.backfillPrelaunchReferenceCorpus({
        dryRun: false,
        now: new Date('2026-06-09T00:00:00.000Z'),
      });

      expect(result.dryRun).toBe(false);
      expect(result.createdTrends).toBe(result.seedTrends);
      expect(prisma.trend.create).toHaveBeenCalledTimes(result.seedTrends);
      expect(prisma.trend.update).not.toHaveBeenCalled();
      expect(referenceCorpus.syncTrendReferences).toHaveBeenCalledTimes(1);
      expect(cache.invalidateByTags).toHaveBeenCalledWith([
        'trends',
        'trends:content',
      ]);
    });
  });
});
