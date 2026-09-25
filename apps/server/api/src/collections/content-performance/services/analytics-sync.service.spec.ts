import type {
  ServerBrandMemorySync,
  ServerLogger,
  ServerPrisma,
} from '@api/server.dependencies';
import { PerformanceSource } from '../schemas/content-performance.schema';
import { AnalyticsSyncService } from './analytics-sync.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

describe('AnalyticsSyncService action operations', () => {
  const analyticsFindMany = vi.fn();
  const postFindMany = vi.fn();
  const performanceUpsert = vi.fn();
  const performanceFindFirst = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const brandMemorySync = {
    detectThresholdAlerts: vi.fn(),
    syncPostPerformance: vi.fn(),
  } satisfies ServerBrandMemorySync;
  const prisma = {
    contentPerformance: {
      upsert: performanceUpsert,
      findFirst: performanceFindFirst,
    },
    post: { findMany: postFindMany },
    postAnalytics: { findMany: analyticsFindMany },
  } as unknown as ServerPrisma;
  let service: AnalyticsSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsSyncService(prisma, brandMemorySync, logger);
    analyticsFindMany.mockResolvedValue([]);
    postFindMany.mockResolvedValue([]);
    performanceUpsert.mockResolvedValue({ id: 'performance-1' });
    performanceFindFirst.mockResolvedValue(null);
    brandMemorySync.detectThresholdAlerts.mockResolvedValue([]);
    brandMemorySync.syncPostPerformance.mockResolvedValue(undefined);
  });

  it('discovers a bounded tenant-scoped action input', async () => {
    analyticsFindMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        date: NOW,
        id: 'analytics-1',
        platform: 'instagram',
        postId: 'post-1',
        clicks: 7,
        totalComments: 5,
        totalLikes: 10,
        totalSaves: 2,
        totalShares: 3,
        totalViews: 1000,
        userId: 'user-1',
      },
    ]);
    postFindMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        category: null,
        description: '\nThe opening hook\nFull post content',
        promptUsed: 'Verified generation prompt',
        generationId: 'generation-1',
        id: 'post-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    const result = await service.discoverItems({ organizationId: 'org-1' });

    expect(result.items).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        clicks: 7,
        hookUsed: 'The opening hook',
        promptUsed: 'Verified generation prompt',
        generationId: 'generation-1',
        measuredAt: NOW.toISOString(),
        organizationId: 'org-1',
        postId: 'post-1',
        views: 1000,
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty('contentRunId');
    expect(Object.values(result.items[0] ?? {})).not.toContain(undefined);
    expect(postFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
      }),
    });
  });

  it('uses post text as prompt fallback and leaves missing provenance absent', async () => {
    analyticsFindMany.mockResolvedValue([
      { id: 'analytics-1', brandId: 'brand-1', postId: 'post-1', date: NOW },
    ]);
    postFindMany.mockResolvedValue([
      {
        id: 'post-1',
        brandId: 'brand-1',
        description: '\nActual hook\nActual body',
      },
    ]);
    const result = await service.discoverItems({ organizationId: 'org-1' });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        hookUsed: 'Actual hook',
        promptUsed: 'Actual hook\nActual body',
      }),
    );
    expect(result.items[0]).not.toHaveProperty('generationId');
    postFindMany.mockResolvedValue([
      { id: 'post-1', brandId: 'brand-1', description: '' },
    ]);
    const empty = await service.discoverItems({ organizationId: 'org-1' });
    expect(empty.items[0]).not.toHaveProperty('hookUsed');
    expect(empty.items[0]).not.toHaveProperty('promptUsed');
  });

  it('fails discovery when a record cannot resolve its tenant post', async () => {
    analyticsFindMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        date: NOW,
        id: 'analytics-1',
        postId: 'post-1',
      },
    ]);

    await expect(
      service.discoverItems({ organizationId: 'org-1' }),
    ).rejects.toThrow('requires a tenant-scoped post and brand');
  });

  it('persists exactly one analytics item and propagates write failures', async () => {
    const item = {
      brandId: 'brand-1',
      clicks: 0,
      comments: 5,
      likes: 10,
      measuredAt: NOW.toISOString(),
      organizationId: 'org-1',
      postId: 'post-1',
      saves: 2,
      shares: 3,
      sourceAnalyticsId: 'analytics-1',
      views: 1000,
    };

    await expect(service.persistItem('org-1', item)).resolves.toEqual({
      contentPerformanceId: 'analytics-sync:analytics-1',
      item: expect.objectContaining(item),
    });
    expect(performanceUpsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        engagementRate: 2,
        id: 'analytics-sync:analytics-1',
        performanceScore: 20,
        source: PerformanceSource.API,
      }),
      update: expect.objectContaining({
        engagementRate: 2,
        data: expect.objectContaining({
          likes: 10,
          views: 1000,
          engagementRate: 2,
        }),
      }),
      where: {
        id: 'analytics-sync:analytics-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
    });

    await service.persistItem('org-1', { ...item, likes: 30 });
    expect(performanceUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'analytics-sync:analytics-1',
          organizationId: 'org-1',
          isDeleted: false,
        },
        update: expect.objectContaining({ likes: 30, engagementRate: 4 }),
      }),
    );

    performanceFindFirst.mockResolvedValueOnce(null);
    performanceUpsert.mockRejectedValueOnce(new Error('write failed'));
    await expect(service.persistItem('org-1', item)).rejects.toThrow(
      'write failed',
    );
  });

  it('runs memory sync and alert detection as separate fail-closed operations', async () => {
    const persisted = {
      contentPerformanceId: 'performance-1',
      item: {
        brandId: 'brand-1',
        clicks: 0,
        comments: 5,
        likes: 10,
        measuredAt: NOW.toISOString(),
        organizationId: 'org-1',
        postId: 'post-1',
        saves: 2,
        shares: 3,
        sourceAnalyticsId: 'analytics-1',
        views: 1000,
      },
    };
    brandMemorySync.detectThresholdAlerts.mockResolvedValue([
      { type: 'spike' },
    ]);

    await service.syncItemMemory('org-1', persisted);
    await expect(service.detectItemAlerts('org-1', persisted)).resolves.toEqual(
      { alerts: 1, contentPerformanceId: 'performance-1' },
    );
    expect(brandMemorySync.syncPostPerformance).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'post-1',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Engagement spike detected for brand=brand-1',
      expect.objectContaining({ type: 'spike' }),
    );
  });

  it('keeps last-sync lookup tenant scoped', async () => {
    await expect(service.getLastSyncDate('org-1')).resolves.toBeNull();
    expect(performanceFindFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
        source: PerformanceSource.API,
      }),
    });
  });
});
