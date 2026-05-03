import { PerformanceSource } from '@api/collections/content-performance/schemas/content-performance.schema';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('AnalyticsSyncService', () => {
  const organizationId = 'org-1';
  const brandId = 'brand-1';
  const postId = 'post-1';

  const prisma = {
    contentPerformance: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
    postAnalytics: {
      findMany: vi.fn(),
    },
  };

  const brandMemorySyncService = {
    detectThresholdAlerts: vi.fn(),
    syncPostPerformance: vi.fn(),
  };

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: AnalyticsSyncService;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma.contentPerformance.create.mockResolvedValue({ id: 'performance-1' });
    prisma.postAnalytics.findMany
      .mockResolvedValueOnce([
        {
          brandId,
          date: new Date('2026-05-01T09:00:00.000Z'),
          platform: 'twitter',
          postId,
          totalComments: 3,
          totalLikes: 20,
          totalSaves: 2,
          totalShares: 5,
          totalViews: 1000,
          userId: 'user-1',
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.post.findMany.mockResolvedValue([
      {
        category: 'text',
        contentRunId: 'run-1',
        creativeVersion: 'creative-v2',
        externalId: 'platform-post-1',
        generationId: 'generation-1',
        hookVersion: 'hook-v1',
        id: postId,
        personaId: 'persona-1',
        publishIntent: 'experiment',
        scheduleSlot: 'weekday-morning',
        variantId: 'variant-a',
      },
    ]);
    brandMemorySyncService.syncPostPerformance.mockResolvedValue(undefined);
    brandMemorySyncService.detectThresholdAlerts.mockResolvedValue([]);

    service = new AnalyticsSyncService(
      prisma as unknown as PrismaService,
      brandMemorySyncService as unknown as BrandMemorySyncService,
      logger as unknown as LoggerService,
    );
  });

  it('persists content run, variant, and experiment metadata for analytics rows', async () => {
    const result = await service.syncAnalytics({
      batchSize: 25,
      organizationId,
    });

    expect(result).toEqual({
      errors: 0,
      organizationId,
      skipped: 0,
      synced: 1,
    });
    expect(prisma.contentPerformance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId,
        contentRunId: 'run-1',
        generationId: 'generation-1',
        organizationId,
        platform: 'twitter',
        postId,
        userId: 'user-1',
        variantId: 'variant-a',
        data: expect.objectContaining({
          contentRunId: 'run-1',
          creativeVersion: 'creative-v2',
          externalPostId: 'platform-post-1',
          generationId: 'generation-1',
          hookVersion: 'hook-v1',
          measuredAt: '2026-05-01T09:00:00.000Z',
          personaId: 'persona-1',
          publishIntent: 'experiment',
          scheduleSlot: 'weekday-morning',
          source: PerformanceSource.API,
          variantId: 'variant-a',
        }),
      }),
    });
    expect(brandMemorySyncService.syncPostPerformance).toHaveBeenCalledWith(
      organizationId,
      brandId,
      postId,
    );
  });
});
