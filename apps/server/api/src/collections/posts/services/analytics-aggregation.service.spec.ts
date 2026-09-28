import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('AnalyticsAggregationService', () => {
  it('scopes PostAnalytics queries to active organization rows', async () => {
    const postAnalyticsAggregate = vi.fn().mockResolvedValue({
      _avg: { engagementRate: null },
      _count: { _all: 0 },
      _sum: {},
    });
    const postAnalyticsGroupBy = vi.fn().mockResolvedValue([]);
    const postsCount = vi.fn().mockResolvedValue(0);
    const brandCount = vi.fn().mockResolvedValue(0);
    const service = new AnalyticsAggregationService(
      {
        $queryRaw: vi.fn().mockResolvedValue([]),
        brand: {
          count: brandCount,
        },
        postAnalytics: {
          aggregate: postAnalyticsAggregate,
          groupBy: postAnalyticsGroupBy,
        },
      } as unknown as PrismaService,
      {
        count: postsCount,
      } as unknown as PostsService,
    );

    await service.getOverviewMetrics(
      'org_1',
      'brand_1',
      '2026-04-01',
      '2026-04-14',
    );
    await service.getTimeSeriesDataWithPlatforms(
      'org_1',
      'brand_1',
      '2026-04-01',
      '2026-04-14',
    );

    const postAnalyticsCalls = [
      ...postAnalyticsAggregate.mock.calls,
      ...postAnalyticsGroupBy.mock.calls,
    ];

    expect(postAnalyticsCalls.length).toBeGreaterThan(0);
    for (const [query] of postAnalyticsCalls) {
      expect(query.where).toMatchObject({
        brandId: 'brand_1',
        organizationId: 'org_1',
      });
      expect(query.where).toHaveProperty('isDeleted', false);
    }
    expect(postsCount).toHaveBeenCalledWith('org_1', {
      brandId: 'brand_1',
    });
    expect(brandCount).toHaveBeenCalledWith({
      where: { isDeleted: false, organizationId: 'org_1' },
    });
  });

  it('counts brands org-scoped, ignoring the brand filter', async () => {
    const postAnalyticsAggregate = vi.fn().mockResolvedValue({
      _avg: { engagementRate: null },
      _count: { _all: 0 },
      _sum: {},
    });
    const postAnalyticsGroupBy = vi.fn().mockResolvedValue([]);
    const postsCount = vi.fn().mockResolvedValue(0);
    const brandCount = vi.fn().mockResolvedValue(3);
    const service = new AnalyticsAggregationService(
      {
        $queryRaw: vi.fn().mockResolvedValue([]),
        brand: {
          count: brandCount,
        },
        postAnalytics: {
          aggregate: postAnalyticsAggregate,
          groupBy: postAnalyticsGroupBy,
        },
      } as unknown as PrismaService,
      {
        count: postsCount,
      } as unknown as PostsService,
    );

    const metrics = await service.getOverviewMetrics(
      'org_1',
      undefined,
      '2026-04-01',
      '2026-04-14',
    );

    expect(metrics.totalBrands).toBe(3);
    expect(brandCount).toHaveBeenCalledWith({
      where: { isDeleted: false, organizationId: 'org_1' },
    });
  });

  // genfeedai/genfeed.ai#5427: total engagement and the engagement rate share
  // one definition (likes + comments + shares + saves), as the overview
  // labels it.
  it('includes saves in overview engagement, its rate, and its growth', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          total_comments: 96,
          total_likes: 640,
          total_posts: 18,
          total_saves: 28,
          total_shares: 60,
          total_views: 12450,
        },
      ])
      .mockResolvedValueOnce([
        {
          total_comments: 40,
          total_likes: 300,
          total_saves: 10,
          total_shares: 50,
          total_views: 10000,
        },
      ]);
    const service = new AnalyticsAggregationService(
      {
        $queryRaw: queryRaw,
        brand: { count: vi.fn().mockResolvedValue(1) },
        postAnalytics: {
          groupBy: vi
            .fn()
            .mockResolvedValue([
              { platform: 'INSTAGRAM' },
              { platform: 'TIKTOK' },
            ]),
        },
      } as unknown as PrismaService,
      { count: vi.fn().mockResolvedValue(18) } as unknown as PostsService,
    );

    const metrics = await service.getOverviewMetrics(
      'org_1',
      undefined,
      '2026-04-01',
      '2026-04-14',
    );

    expect(metrics.totalEngagement).toBe(824);
    expect(metrics.avgEngagementRate).toBe((824 / 12450) * 100);
    expect(metrics.engagementGrowth).toBe(((824 - 400) / 400) * 100);
    expect(metrics.totalViews).toBe(12450);
    expect(metrics.viewsGrowth).toBe(((12450 - 10000) / 10000) * 100);
    expect(metrics.activePlatforms).toEqual(['instagram', 'tiktok']);
    expect(metrics.bestPerformingPlatform).toBe('instagram');
  });
});
