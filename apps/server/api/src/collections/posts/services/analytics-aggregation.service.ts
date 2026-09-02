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
import { assertAnalyticsBrandInScope } from '@api/endpoints/analytics/analytics-tenant-scope';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric, toPrismaCredentialPlatform } from '@genfeedai/enums';
import {
  Prisma,
  CredentialPlatform as PrismaCredentialPlatform,
} from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

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

  public async assertBrandInScope(
    brandId: string | undefined,
    organizationId: string | undefined,
  ): Promise<void> {
    await assertAnalyticsBrandInScope(
      (where) => this.prisma.brand.findFirst({ select: { id: true }, where }),
      brandId,
      organizationId,
    );
  }

  private buildBrandSqlPredicate(brandId?: string): Prisma.Sql {
    return brandId ? Prisma.sql`AND "brandId" = ${brandId}` : Prisma.empty;
  }

  private buildPostAnalyticsWhere(options: {
    brandId?: string;
    endDate: Date;
    organizationId: string;
    platform?: PrismaCredentialPlatform;
    startDate: Date;
  }): Prisma.PostAnalyticsWhereInput {
    return {
      ...(options.brandId ? { brandId: options.brandId } : {}),
      date: { gte: options.startDate, lte: options.endDate },
      organizationId: options.organizationId,
      ...(options.platform ? { platform: options.platform } : {}),
    };
  }

  private parseAnalyticsPlatform(platform: string): PrismaCredentialPlatform {
    const prismaPlatform = toPrismaCredentialPlatform(platform);

    if (!prismaPlatform) {
      throw new BadRequestException(
        `Unsupported analytics platform: ${platform}`,
      );
    }

    // Prisma client enum values match the shared SCREAMING inventory 1:1.
    return prismaPlatform as PrismaCredentialPlatform;
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

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate: parsedEndDate,
      organizationId,
      startDate: parsedStartDate,
    });

    // Previous period
    const prevWhere = this.buildPostAnalyticsWhere({
      brandId,
      endDate: previousEndDate,
      organizationId,
      startDate: previousStartDate,
    });

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
          where,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere,
        }),
        this.prisma.postAnalytics.groupBy({
          _sum: { totalViews: true },
          by: ['platform'],
          orderBy: { _sum: { totalViews: 'desc' } },
          take: 20,
          where,
        }),
      ]);

    const postCount = await this.postsService.count(organizationId, {
      ...(brandId ? { brandId } : {}),
    });

    // Authoritative brand count for the organization — org-scoped and
    // soft-delete-aware so the "Total Brands" metric matches the brand switcher.
    const totalBrands = await this.prisma.brand.count({
      where: scopedWhere(organizationId, {}),
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
    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate,
      organizationId,
      startDate,
    });

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
      where,
    });

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

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate,
      organizationId,
      startDate,
    });

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
      where,
    });

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

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate,
      organizationId,
      startDate,
    });

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
      where,
    });

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
      where: scopedWhere(organizationId, { id: { in: postIds } }),
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

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate,
      organizationId,
      startDate,
    });

    const prevWhere = this.buildPostAnalyticsWhere({
      brandId,
      endDate: previousEndDate,
      organizationId,
      startDate: previousStartDate,
    });

    const [currentAggregate, previousAggregate, viewsByDateRows] =
      await Promise.all([
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere,
        }),
        this.prisma.postAnalytics.groupBy({
          _sum: { totalViews: true },
          by: ['date'],
          orderBy: { _sum: { totalViews: 'desc' } },
          take: 1,
          where,
        }),
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

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate,
      organizationId,
      startDate,
    });

    const aggregate = await this.prisma.postAnalytics.aggregate({
      _sum: {
        totalComments: true,
        totalLikes: true,
        totalSaves: true,
        totalShares: true,
      },
      where,
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

    const normalizedPlatform = this.parseAnalyticsPlatform(platform);

    const where = this.buildPostAnalyticsWhere({
      brandId,
      endDate: parsedEndDate,
      organizationId,
      platform: normalizedPlatform,
      startDate: parsedStartDate,
    });

    const prevWhere = this.buildPostAnalyticsWhere({
      brandId,
      endDate: previousEndDate,
      organizationId,
      platform: normalizedPlatform,
      startDate: previousStartDate,
    });

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
          where,
        }),
        this.prisma.postAnalytics.aggregate({
          _sum: {
            totalComments: true,
            totalLikes: true,
            totalShares: true,
            totalViews: true,
          },
          where: prevWhere,
        }),
        this.prisma.$queryRaw<DistinctPostCountRow[]>(
          Prisma.sql`
          SELECT COUNT(DISTINCT "postId") AS post_count
          FROM "post_analytics"
          WHERE "organizationId" = ${organizationId}
            AND "platform" = ${normalizedPlatform}
            AND "date" >= ${parsedStartDate}
            AND "date" <= ${parsedEndDate}
            ${this.buildBrandSqlPredicate(brandId)}
        `,
        ),
      ]);

    // Authoritative brand count for the organization — org-scoped and
    // soft-delete-aware so the "Total Brands" metric matches the brand switcher.
    const totalBrands = await this.prisma.brand.count({
      where: scopedWhere(organizationId, {}),
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
