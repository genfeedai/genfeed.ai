import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric } from '@genfeedai/contracts';

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
  // genfeedai/genfeed.ai#5449: saves are engagement in per-post time series
  // and top content, matching the overview.
  it('includes saves in time-series total engagement', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      {
        _avg: { engagementRate: 10 },
        _sum: {
          totalComments: 2,
          totalLikes: 4,
          totalSaves: 8,
          totalShares: 1,
          totalViews: 20,
        },
        date: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);
    const service = new AnalyticsAggregationService(
      { postAnalytics: { groupBy } } as unknown as PrismaService,
      {} as unknown as PostsService,
    );

    const points = await service.getTimeSeriesData(
      'org_1',
      undefined,
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-02T00:00:00.000Z'),
    );

    expect(points).toEqual([
      expect.objectContaining({ saves: 8, totalEngagement: 15 }),
    ]);
  });

  it('ranks top content by engagement including saves', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        avg_engagement_rate: 2,
        max_comments: 0,
        max_likes: 10,
        max_saves: 90,
        max_shares: 0,
        max_views: 100,
        platform: 'INSTAGRAM',
        post_id: 'post_saves',
      },
      {
        avg_engagement_rate: 1,
        max_comments: 5,
        max_likes: 50,
        max_saves: 0,
        max_shares: 5,
        max_views: 500,
        platform: 'TIKTOK',
        post_id: 'post_likes',
      },
    ]);
    const postFindMany = vi.fn().mockResolvedValue([
      { description: '', id: 'post_saves', label: 'Saved a lot' },
      { description: '', id: 'post_likes', label: 'Liked a lot' },
    ]);
    const service = new AnalyticsAggregationService(
      {
        $queryRaw: queryRaw,
        post: { findMany: postFindMany },
      } as unknown as PrismaService,
      {} as unknown as PostsService,
    );

    const top = await service.getTopPerformingContent(
      'org_1',
      'brand_1',
      2,
      AnalyticsMetric.ENGAGEMENT,
      '2026-04-01',
      '2026-04-14',
    );

    const [query] = queryRaw.mock.calls[0] ?? [];
    expect(query.sql).toContain(
      'ORDER BY (MAX("totalLikes") + MAX("totalComments") + MAX("totalShares") + MAX("totalSaves")) DESC',
    );
    expect(query.sql).toContain('"isDeleted" = false');
    expect(query.values).toContain('org_1');
    expect(query.values).toContain('brand_1');
    expect(
      top.map((item) => [item.postId, item.saves, item.totalEngagement]),
    ).toEqual([
      ['post_saves', 90, 100],
      ['post_likes', 0, 60],
    ]);
    expect(top.map((item) => item.platform)).toEqual(['instagram', 'tiktok']);
  });
});
