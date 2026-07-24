import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('AnalyticsAggregationService', () => {
  it('does not add soft-delete filters to PostAnalytics queries', async () => {
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
      expect(query.where).not.toHaveProperty('isDeleted');
    }
    expect(postsCount).toHaveBeenCalledWith({
      brandId: 'brand_1',
      isDeleted: false,
      organizationId: 'org_1',
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
});
