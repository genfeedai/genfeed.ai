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
    const service = new AnalyticsAggregationService(
      {
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
  });
});
