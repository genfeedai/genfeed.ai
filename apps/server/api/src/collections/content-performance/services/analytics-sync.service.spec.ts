import { PerformanceSource } from '@server/collections/content-performance/schemas/content-performance.schema';
import { AnalyticsSyncService } from '@server/collections/content-performance/services/analytics-sync.service';
import { BrandMemorySyncService } from '@server/services/brand-memory/brand-memory-sync.service';
import { ContentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import type { ServerPrisma } from '@server/server.dependencies';

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
        workflowExecutionId: 'workflow-execution-1',
      },
    ]);
    brandMemorySyncService.syncPostPerformance.mockResolvedValue(undefined);
    brandMemorySyncService.detectThresholdAlerts.mockResolvedValue([]);

    service = new AnalyticsSyncService(
      prisma as unknown as ServerPrisma,
      brandMemorySyncService as unknown as BrandMemorySyncService,
      logger as unknown as LoggerService,
    );
  });

  it('persists workflow, content-run, variant, and experiment lineage for analytics rows', async () => {
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
        comments: 3,
        contentType: ContentType.CAPTION,
        contentRunId: 'run-1',
        engagementRate: 3,
        externalPostId: 'platform-post-1',
        generationId: 'generation-1',
        likes: 20,
        measuredAt: new Date('2026-05-01T09:00:00.000Z'),
        organizationId,
        platform: 'twitter',
        postId,
        revenue: 0,
        saves: 2,
        shares: 5,
        source: PerformanceSource.API,
        userId: 'user-1',
        variantId: 'variant-a',
        views: 1000,
        workflowExecutionId: 'workflow-execution-1',
        data: {
          clicks: 0,
          creativeVersion: 'creative-v2',
          hookVersion: 'hook-v1',
          personaId: 'persona-1',
          publishIntent: 'experiment',
          scheduleSlot: 'weekday-morning',
        },
      }),
    });
    expect(brandMemorySyncService.syncPostPerformance).toHaveBeenCalledWith(
      organizationId,
      brandId,
      postId,
    );
  });

  it('uses the canonical measuredAt column', async () => {
    const measuredAt = new Date('2026-05-02T09:00:00.000Z');
    prisma.contentPerformance.findFirst.mockResolvedValue({
      createdAt: new Date('2026-05-03T09:00:00.000Z'),
      measuredAt,
    });

    await expect(
      service.getLastSyncDate(organizationId, brandId),
    ).resolves.toBe(measuredAt);
    expect(prisma.contentPerformance.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        source: PerformanceSource.API,
      },
    });
  });
});
