import type {
  AnalyticsAggregateResult,
  AnalyticsDateRow,
  AnalyticsPlatformDateRow,
  DistinctPostCountRow,
  EngagementBreakdown,
  GrowthTrends,
  NumericSqlValue,
  OverviewMetrics,
  PlatformComparison,
  PlatformComparisonRow,
  PlatformMetrics,
  PostViewsRow,
  TimeSeriesDataPoint,
  TimeSeriesDataPointWithPlatforms,
  TopContent,
  TopContentAnalyticsRow,
  TopContentPostRow,
  ViewsByDateRow,
} from '@api/collections/posts/services/analytics-aggregation.types';
import { PostAnalyticsProjection } from '@api/collections/posts/services/post-analytics.projection';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export type {
  DistinctPostCountRow,
  EngagementBreakdown,
  GrowthTrends,
  NumericSqlValue,
  OverviewMetrics,
  PlatformComparison,
  PlatformComparisonRow,
  PlatformMetrics,
  PostViewsRow,
  TimeSeriesDataPoint,
  TimeSeriesDataPointWithPlatforms,
  TopContent,
};

const postAnalyticsProjection = new PostAnalyticsProjection();

@Injectable()
export class AnalyticsAggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  private buildBrandSqlPredicate(brandId?: string): Prisma.Sql {
    return brandId ? Prisma.sql`AND "brandId" = ${brandId}` : Prisma.empty;
  }

  /**
   * Get overview metrics aggregated across all posts
   */
  async getOverviewMetrics(
    organizationId: string,
    brandId?: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<OverviewMetrics> {
    const {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      previousStartDate,
      previousEndDate,
    } = DateRangeUtil.parseDateRange(startDate, endDate);

    const where: Record<string, unknown> = {
      date: { gte: parsedStartDate, lte: parsedEndDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    // Previous period
    const prevWhere: Record<string, unknown> = {
      date: { gte: previousStartDate, lte: previousEndDate },
      organizationId,
    };
    if (brandId) prevWhere.brandId = brandId;

    const [currentAggregate, previousAggregate, platformRows] =
      await Promise.all([
        this.prisma.postAnalytics.aggregate({
          _avg: { engagementRate: true },
          _count: { _all: true },
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalSaves: true,
            totalShares: true,
            totalViews: true,
          },
          where: where as never,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere as never,
        }),
        this.prisma.postAnalytics.groupBy({
          _sum: { totalViews: true },
          by: ['platform'],
          orderBy: { _sum: { totalViews: 'desc' } },
          take: 20,
          where: where as never,
        } as never),
      ]);

    const postCount = await this.postsService.count({
      isDeleted: false,
      organizationId,
      ...(brandId ? { brandId } : {}),
    });

    // Authoritative brand count for the organization — org-scoped and
    // soft-delete-aware so the "Total Brands" metric matches the brand switcher.
    const totalBrands = await this.prisma.brand.count({
      where: { isDeleted: false, organizationId },
    });

    const activePlatforms = (platformRows as Array<{ platform: string }>).map(
      (row) => row.platform,
    );

    return postAnalyticsProjection.buildOverview({
      activePlatforms,
      currentAggregate: currentAggregate as AnalyticsAggregateResult,
      previousAggregate: previousAggregate as AnalyticsAggregateResult,
      totalBrands,
      totalPosts: postCount,
    });
  }

  /**
   * Get time series data for charts
   */
  async getTimeSeriesData(
    organizationId: string,
    brandId: string | undefined,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' = 'day',
  ): Promise<TimeSeriesDataPoint[]> {
    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const rows = await this.prisma.postAnalytics.groupBy({
      _avg: { engagementRate: true },
      _sum: {
        totalComments: true,
        totalLikes: true,
        totalSaves: true,
        totalShares: true,
        totalViews: true,
      },
      by: ['date'],
      orderBy: { date: 'asc' },
      where: where as never,
    } as never);

    return postAnalyticsProjection.buildTimeSeries(
      rows as AnalyticsDateRow[],
      groupBy,
    );
  }

  /**
   * Get time series data with platform breakdown
   */
  async getTimeSeriesDataWithPlatforms(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
    groupBy: 'day' | 'week' = 'day',
  ): Promise<TimeSeriesDataPointWithPlatforms[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const rows = await this.prisma.postAnalytics.groupBy({
      _avg: { engagementRate: true },
      _sum: {
        totalComments: true,
        totalLikes: true,
        totalSaves: true,
        totalShares: true,
        totalViews: true,
      },
      by: ['date', 'platform'],
      where: where as never,
    } as never);

    return postAnalyticsProjection.buildTimeSeriesWithPlatforms(
      rows as AnalyticsPlatformDateRow[],
      startDate,
      endDate,
      groupBy,
    );
  }

  /**
   * Get platform comparison metrics
   */
  async getPlatformComparison(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<PlatformComparison[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const rows = await this.prisma.$queryRaw<PlatformComparisonRow[]>(
      Prisma.sql`
        SELECT
          "platform"::text AS platform,
          SUM("totalViews") AS views,
          SUM("totalLikes") AS likes,
          SUM("totalComments") AS comments,
          SUM("totalShares") AS shares,
          SUM("totalSaves") AS saves,
          AVG("engagementRate") AS engagement_rate,
          COUNT(DISTINCT "postId") AS post_count
        FROM "post_analytics"
        WHERE "organizationId" = ${organizationId}
          AND "date" >= ${startDate}
          AND "date" <= ${endDate}
          ${this.buildBrandSqlPredicate(brandId)}
        GROUP BY "platform"
        ORDER BY views DESC
        LIMIT 20
      `,
    );

    return postAnalyticsProjection.buildPlatformComparison(rows);
  }

  /**
   * Get top performing content
   */
  async getTopPerformingContent(
    organizationId: string,
    brandId: string | undefined,
    limit: number = 10,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT = AnalyticsMetric.VIEWS,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<TopContent[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const candidateLimit =
      metric === AnalyticsMetric.ENGAGEMENT
        ? Math.min(safeLimit * 5, 250)
        : safeLimit;
    const rows = await this.prisma.postAnalytics.groupBy({
      _avg: { engagementRate: true },
      _max: {
        totalComments: true,
        totalLikes: true,
        totalShares: true,
        totalViews: true,
      },
      by: ['postId', 'platform'],
      orderBy:
        metric === AnalyticsMetric.ENGAGEMENT
          ? { _max: { totalLikes: 'desc' } }
          : { _max: { totalViews: 'desc' } },
      take: candidateLimit,
      where: where as never,
    } as never);

    const topScored = postAnalyticsProjection.scoreTopContent(
      rows as TopContentAnalyticsRow[],
      metric,
      safeLimit,
    );

    // Fetch post details
    const postIds = topScored.map((s) => s.postId);
    const posts = await this.prisma.post.findMany({
      select: {
        description: true,
        id: true,
        label: true,
        publicationDate: true,
        url: true,
      },
      take: postIds.length,
      where: { id: { in: postIds } },
    });

    return postAnalyticsProjection.buildTopContent(
      topScored,
      posts as unknown as TopContentPostRow[],
    );
  }

  /**
   * Get growth trends
   */
  async getGrowthTrends(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<GrowthTrends> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      DateRangeUtil.parseDateRange(startDateInput, endDateInput);

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) where.brandId = brandId;

    const prevWhere: Record<string, unknown> = {
      date: { gte: previousStartDate, lte: previousEndDate },
      organizationId,
    };

    if (brandId) prevWhere.brandId = brandId;

    const [currentAggregate, previousAggregate, viewsByDateRows] =
      await Promise.all([
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: where as never,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere as never,
        }),
        this.prisma.postAnalytics.groupBy({
          _sum: { totalViews: true },
          by: ['date'],
          orderBy: { _sum: { totalViews: 'desc' } },
          take: 1,
          where: where as never,
        } as never),
      ]);

    return postAnalyticsProjection.buildGrowthTrends(
      currentAggregate as AnalyticsAggregateResult,
      previousAggregate as AnalyticsAggregateResult,
      viewsByDateRows as ViewsByDateRow[],
    );
  }

  /**
   * Get engagement breakdown
   */
  async getEngagementBreakdown(
    organizationId: string,
    brandId: string | undefined,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<EngagementBreakdown> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) where.brandId = brandId;

    const aggregate = await this.prisma.postAnalytics.aggregate({
      _sum: {
        totalComments: true,
        totalLikes: true,
        totalSaves: true,
        totalShares: true,
      },
      where: where as never,
    });

    return postAnalyticsProjection.buildEngagementBreakdown(
      aggregate as AnalyticsAggregateResult,
    );
  }

  /**
   * Get platform-level analytics (all posts for a specific platform)
   */
  async getPlatformAnalytics(
    organizationId: string,
    platform: string,
    brandId?: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<OverviewMetrics> {
    const {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      previousStartDate,
      previousEndDate,
    } = DateRangeUtil.parseDateRange(startDate, endDate);

    const where: Record<string, unknown> = {
      date: { gte: parsedStartDate, lte: parsedEndDate },
      organizationId,
      platform,
    };

    if (brandId) where.brandId = brandId;

    const prevWhere: Record<string, unknown> = {
      date: { gte: previousStartDate, lte: previousEndDate },
      organizationId,
      platform,
    };

    if (brandId) prevWhere.brandId = brandId;

    const [currentAggregate, previousAggregate, postCountRows] =
      await Promise.all([
        this.prisma.postAnalytics.aggregate({
          _avg: { engagementRate: true },
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalSaves: true,
            totalShares: true,
            totalViews: true,
          },
          where: where as never,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere as never,
        }),
        this.prisma.$queryRaw<DistinctPostCountRow[]>(
          Prisma.sql`
          SELECT COUNT(DISTINCT "postId") AS post_count
          FROM "post_analytics"
          WHERE "organizationId" = ${organizationId}
            AND "platform" = ${platform}
            AND "date" >= ${parsedStartDate}
            AND "date" <= ${parsedEndDate}
            ${this.buildBrandSqlPredicate(brandId)}
        `,
        ),
      ]);

    // Authoritative brand count for the organization — org-scoped and
    // soft-delete-aware so the "Total Brands" metric matches the brand switcher.
    const totalBrands = await this.prisma.brand.count({
      where: { isDeleted: false, organizationId },
    });

    return postAnalyticsProjection.buildPlatformOverview({
      currentAggregate: currentAggregate as AnalyticsAggregateResult,
      platform,
      previousAggregate: previousAggregate as AnalyticsAggregateResult,
      totalBrands,
      totalPosts: Number(postCountRows[0]?.post_count ?? 0),
    });
  }
}
