import type {
  ServerBrandMemorySync,
  ServerLogger,
  ServerPrisma,
} from '@server/server.dependencies';
import { PerformanceSource } from '../schemas/content-performance.schema';
import { AnalyticsSyncService } from './analytics-sync.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

type AnalyticsRow = {
  brandId: string | null;
  date: Date;
  platform: string | null;
  postId: string;
  totalComments: number | null;
  totalLikes: number | null;
  totalSaves: number | null;
  totalShares: number | null;
  totalViews: number | null;
  userId: string | null;
};

function makeAnalytics(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    brandId: 'brand-1',
    date: NOW,
    platform: 'instagram',
    postId: 'post-1',
    totalComments: 5,
    totalLikes: 10,
    totalSaves: 2,
    totalShares: 3,
    totalViews: 1000,
    userId: 'user-1',
    ...overrides,
  };
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    category: null,
    contentRunId: 'run-1',
    creativeVersion: 'cv-1',
    externalId: 'ext-1',
    generationId: 'gen-1',
    hookVersion: 'hv-1',
    id: 'post-1',
    personaId: 'persona-1',
    publishIntent: 'launch',
    scheduleSlot: 'morning',
    variantId: 'variant-1',
    ...overrides,
  };
}

describe('AnalyticsSyncService', () => {
  const analyticsFindMany = vi.fn();
  const postFindMany = vi.fn();
  const performanceCreate = vi.fn();
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
      create: performanceCreate,
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
    performanceCreate.mockResolvedValue({});
    performanceFindFirst.mockResolvedValue(null);
    brandMemorySync.detectThresholdAlerts.mockResolvedValue([]);
    brandMemorySync.syncPostPerformance.mockResolvedValue(undefined);
  });

  describe('syncAnalytics', () => {
    it('returns a zeroed result when there is no analytics data', async () => {
      const result = await service.syncAnalytics({ organizationId: 'org-1' });

      expect(result).toEqual({
        brandId: undefined,
        errors: 0,
        organizationId: 'org-1',
        skipped: 0,
        synced: 0,
      });
      expect(performanceCreate).not.toHaveBeenCalled();
    });

    it('creates a content performance row with computed engagement and score', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      const result = await service.syncAnalytics({ organizationId: 'org-1' });

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);

      const created = performanceCreate.mock.calls[0]?.[0]?.data;
      // (10 likes + 5 comments + 3 shares + 2 saves) / 1000 views * 100
      expect(created.engagementRate).toBe(2);
      // clicks are always 0 from platform analytics: 20/1000*100 = 2 -> round(2*10)
      expect(created.performanceScore).toBe(20);
      expect(created.organizationId).toBe('org-1');
      expect(created.isDeleted).toBe(false);
      expect(created.source).toBe(PerformanceSource.API);
      expect(created.postId).toBe('post-1');
      expect(created.externalPostId).toBe('ext-1');
      expect(created.contentRunId).toBe('run-1');
      expect(created.variantId).toBe('variant-1');
      expect(created.data).toEqual({
        clicks: 0,
        creativeVersion: 'cv-1',
        hookVersion: 'hv-1',
        personaId: 'persona-1',
        publishIntent: 'launch',
        scheduleSlot: 'morning',
      });
    });

    it('scopes the post lookup to the organization and excludes soft-deleted rows', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      expect(postFindMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('computes zero engagement and score when there are no views', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ totalViews: 0 }),
      ]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      const created = performanceCreate.mock.calls[0]?.[0]?.data;
      expect(created.engagementRate).toBe(0);
      expect(created.performanceScore).toBe(0);
    });

    it('caps the performance score at 100', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({
          totalComments: 200,
          totalLikes: 500,
          totalSaves: 100,
          totalShares: 200,
          totalViews: 1000,
        }),
      ]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      expect(performanceCreate.mock.calls[0]?.[0]?.data.performanceScore).toBe(
        100,
      );
    });

    it('coerces null metric columns to zero', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({
          totalComments: null,
          totalLikes: null,
          totalSaves: null,
          totalShares: null,
          totalViews: null,
        }),
      ]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      const created = performanceCreate.mock.calls[0]?.[0]?.data;
      expect(created.likes).toBe(0);
      expect(created.comments).toBe(0);
      expect(created.views).toBe(0);
    });

    it('leaves post-derived fields undefined when the post is missing', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      const created = performanceCreate.mock.calls[0]?.[0]?.data;
      expect(created.externalPostId).toBeUndefined();
      expect(created.contentRunId).toBeUndefined();
      expect(created.data.creativeVersion).toBeUndefined();
    });

    it('filters by brand id and since date when provided', async () => {
      const since = new Date('2026-07-01T00:00:00.000Z');

      await service.syncAnalytics({
        brandId: 'brand-9',
        organizationId: 'org-1',
        since,
      });

      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-9',
            date: { gte: since },
            organizationId: 'org-1',
          },
        }),
      );
    });

    it('counts an error and keeps going when creating a performance row fails', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ postId: 'post-1' }),
        makeAnalytics({ postId: 'post-2' }),
      ]);
      postFindMany.mockResolvedValueOnce([makePost()]);
      performanceCreate.mockRejectedValueOnce(new Error('write failed'));

      const result = await service.syncAnalytics({ organizationId: 'org-1' });

      expect(result.errors).toBe(1);
      expect(result.synced).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync analytics for post post-1'),
        expect.any(Error),
      );
    });

    it('syncs brand memory for every post that has a brand', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      expect(brandMemorySync.syncPostPerformance).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'post-1',
      );
    });

    it('does not sync brand memory when the analytics row has no brand', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ brandId: null }),
      ]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      expect(brandMemorySync.syncPostPerformance).not.toHaveBeenCalled();
      expect(brandMemorySync.detectThresholdAlerts).not.toHaveBeenCalled();
    });

    it('logs but does not fail the sync when brand memory sync throws', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);
      brandMemorySync.syncPostPerformance.mockRejectedValueOnce(
        new Error('memory down'),
      );

      const result = await service.syncAnalytics({ organizationId: 'org-1' });

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to sync brand memory for post post-1',
        expect.any(Error),
      );
    });

    it('warns for each threshold alert detected on a touched brand', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);
      brandMemorySync.detectThresholdAlerts.mockResolvedValueOnce([
        {
          baselineAverage: 1,
          metric: 'engagementRate',
          ratio: 2,
          recentAverage: 2,
          type: 'spike',
        },
      ]);

      await service.syncAnalytics({ organizationId: 'org-1' });

      expect(logger.warn).toHaveBeenCalledWith(
        'Engagement spike detected for brand=brand-1',
        expect.objectContaining({ type: 'spike' }),
      );
    });

    it('logs when threshold alert detection throws', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);
      brandMemorySync.detectThresholdAlerts.mockRejectedValueOnce(
        new Error('alerts down'),
      );

      const result = await service.syncAnalytics({ organizationId: 'org-1' });

      expect(result.synced).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to detect threshold alerts for brand=brand-1',
        expect.any(Error),
      );
    });

    it('pages through analytics until a short batch is returned', async () => {
      analyticsFindMany
        .mockResolvedValueOnce([makeAnalytics(), makeAnalytics()])
        .mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValue([makePost()]);

      const result = await service.syncAnalytics({
        batchSize: 2,
        organizationId: 'org-1',
      });

      expect(analyticsFindMany).toHaveBeenCalledTimes(2);
      expect(analyticsFindMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ skip: 2, take: 2 }),
      );
      expect(result.synced).toBe(3);
    });

    it('stops paging when a full batch is followed by an empty one', async () => {
      analyticsFindMany
        .mockResolvedValueOnce([makeAnalytics(), makeAnalytics()])
        .mockResolvedValueOnce([]);
      postFindMany.mockResolvedValue([makePost()]);

      const result = await service.syncAnalytics({
        batchSize: 2,
        organizationId: 'org-1',
      });

      expect(analyticsFindMany).toHaveBeenCalledTimes(2);
      expect(result.synced).toBe(2);
    });
  });

  describe('getLastSyncDate', () => {
    it('returns null when no API-sourced performance row exists', async () => {
      await expect(service.getLastSyncDate('org-1')).resolves.toBeNull();
    });

    it('scopes the lookup to the org, soft-delete and API source', async () => {
      await service.getLastSyncDate('org-1');

      expect(performanceFindFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
          source: PerformanceSource.API,
        }),
      });
    });

    it('adds the brand filter when a brand id is given', async () => {
      await service.getLastSyncDate('org-1', 'brand-7');

      expect(performanceFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ brandId: 'brand-7' }),
        }),
      );
    });

    it('prefers measuredAt over createdAt', async () => {
      const measuredAt = new Date('2026-07-15T00:00:00.000Z');
      performanceFindFirst.mockResolvedValueOnce({
        createdAt: NOW,
        measuredAt,
      });

      await expect(service.getLastSyncDate('org-1')).resolves.toBe(measuredAt);
    });

    it('falls back to createdAt when measuredAt is null', async () => {
      performanceFindFirst.mockResolvedValueOnce({
        createdAt: NOW,
        measuredAt: null,
      });

      await expect(service.getLastSyncDate('org-1')).resolves.toBe(NOW);
    });
  });
});
