import {
  analyticsPeriodSeriesSql,
  analyticsPeriodTotalsSql,
} from '@api/endpoints/analytics/analytics-period-sql';
import {
  type AnalyticsBestPostingTime,
  AnalyticsResponseProjection,
  type RawAnalyticsRow,
  type ViralHooksResult,
} from '@api/endpoints/analytics/analytics-response.projection';
import { assertAnalyticsBrandInScope } from '@api/endpoints/analytics/analytics-tenant-scope';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PrismaSql = ReturnType<typeof Prisma.sql>;
type PostAnalyticsTextColumn = 'brandId' | 'organizationId';

export type { AnalyticsBestPostingTime } from '@api/endpoints/analytics/analytics-response.projection';

const analyticsResponseProjection = new AnalyticsResponseProjection();

@Injectable()
export class AnalyticsService extends BaseService<Record<string, unknown>> {
  constructor(
    protected readonly prisma: PrismaService,
    configService: ConfigService,
    logger: LoggerService,
  ) {
    super(prisma, 'analytic', logger, configService);
  }

  public async assertBrandInScope(
    brandId: string | undefined,
    organizationId: string | undefined,
  ): Promise<void> {
    await assertAnalyticsBrandInScope(
      async (where) => {
        // tenant-scope-ignore: assertAnalyticsBrandInScope always sets id and isDeleted; organizationId is omitted only for superadmin
        return this.prisma.brand.findFirst({ select: { id: true }, where });
      },
      brandId,
      organizationId,
    );
  }

  private postAnalyticsTextColumn(
    column: PostAnalyticsTextColumn,
    alias?: 'pa',
  ): PrismaSql {
    const prefix = alias ? `${alias}.` : '';
    return Prisma.raw(`${prefix}"${column}"`);
  }

  private postAnalyticsOptionalTextFilter(
    column: PostAnalyticsTextColumn,
    value?: string,
    alias?: 'pa',
  ): PrismaSql {
    if (!value) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${this.postAnalyticsTextColumn(column, alias)} = ${value}`;
  }

  private postAnalyticsOptionalPlatformFilter(
    platform?: CredentialPlatform,
    alias?: 'pa',
  ): PrismaSql {
    if (!platform) {
      return Prisma.empty;
    }

    return Prisma.sql`AND ${Prisma.raw(`${alias ? `${alias}.` : ''}"platform"`)}::text = ${String(platform)}`;
  }

  private postAnalyticsTopContentSortExpression(
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.LIKES,
  ): PrismaSql {
    switch (metric) {
      case AnalyticsMetric.ENGAGEMENT:
        return Prisma.raw(
          '(pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") DESC',
        );
      case AnalyticsMetric.LIKES:
        return Prisma.raw('pa."totalLikes" DESC');
      default:
        return Prisma.raw('pa."totalViews" DESC');
    }
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getTimeSeriesData(
    startDate: string,
    endDate: string,
    organizationId?: string,
    brandId?: string,
  ): Promise<unknown[]> {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999); // Include the entire end date (UTC)

    const rawResults = await this.prisma.$queryRaw<RawAnalyticsRow[]>(
      analyticsPeriodSeriesSql({
        brandFilter: this.postAnalyticsOptionalTextFilter('brandId', brandId),
        endDate: end,
        orgFilter: this.postAnalyticsOptionalTextFilter(
          'organizationId',
          organizationId,
        ),
        startDate: start,
      }),
    );

    return analyticsResponseProjection.buildTimeSeries(rawResults, start, end);
  }

  /**
   * Get high-level overview analytics
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getOverview(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<unknown> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      DateRangeUtil.parseDateRange(startDateStr, endDateStr);

    // Build conditional WHERE fragments
    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    const [current, previous, { brandCount, orgCount }] = await Promise.all([
      this.fetchOverviewCurrentMetrics(
        startDate,
        endDate,
        brandFilter,
        orgFilter,
      ),
      this.fetchOverviewPreviousMetrics(
        previousStartDate,
        previousEndDate,
        brandFilter,
        orgFilter,
      ),
      this.countOverviewEntities(organizationId),
    ]);

    const metrics = analyticsResponseProjection.buildOverview(
      current,
      previous,
    );

    return {
      ...metrics,
      brandCount,
      organizationCount: orgCount,
    };
  }

  private async fetchOverviewCurrentMetrics(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow> {
    const currentMetrics = await this.prisma.$queryRaw<RawAnalyticsRow[]>(
      analyticsPeriodTotalsSql({
        brandFilter,
        endDate,
        orgFilter,
        startDate,
      }),
    );
    return this.withDerivedOverviewMetrics(currentMetrics[0]);
  }

  private async fetchOverviewPreviousMetrics(
    previousStartDate: Date,
    previousEndDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow> {
    const previousMetrics = await this.prisma.$queryRaw<RawAnalyticsRow[]>(
      analyticsPeriodTotalsSql({
        brandFilter,
        endDate: previousEndDate,
        orgFilter,
        startDate: previousStartDate,
      }),
    );

    return this.withDerivedOverviewMetrics(previousMetrics[0]);
  }

  private withDerivedOverviewMetrics(
    row: RawAnalyticsRow | undefined,
  ): RawAnalyticsRow {
    const totalComments = Number(row?.total_comments ?? 0);
    const totalLikes = Number(row?.total_likes ?? 0);
    const totalSaves = Number(row?.total_saves ?? 0);
    const totalShares = Number(row?.total_shares ?? 0);
    const totalViews = Number(row?.total_views ?? 0);
    const totalEngagement =
      totalLikes + totalComments + totalShares + totalSaves;

    return {
      avg_engagement_rate:
        totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0,
      total_comments: totalComments,
      total_engagement: totalEngagement,
      total_likes: totalLikes,
      total_posts: Number(row?.total_posts ?? 0),
      total_saves: totalSaves,
      total_shares: totalShares,
      total_views: totalViews,
    };
  }

  private async countOverviewEntities(
    organizationId?: string,
  ): Promise<{ brandCount: number; orgCount: number }> {
    // Count organizations and brands via Prisma
    const orgWhere = organizationId
      ? { isDeleted: false, id: organizationId }
      : { isDeleted: false };
    const brandWhere = organizationId
      ? { isDeleted: false, organizationId }
      : { isDeleted: false };

    const [orgCount, brandCount] = await Promise.all([
      this.prisma.organization.count({ where: orgWhere }),
      this.prisma.brand.count({ where: brandWhere }),
    ]);

    return { brandCount, orgCount };
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getBestPostingTimes(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<AnalyticsBestPostingTime[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    // Group by platform and hour, pick the best hour per platform
    const results = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      WITH hour_stats AS (
        SELECT
          "platform"::text AS platform,
          EXTRACT(HOUR FROM "date") AS hour,
          AVG("engagementRate") AS avg_engagement_rate,
          COUNT(*) AS post_count
        FROM "post_analytics"
        WHERE "date" >= ${startDate} AND "date" <= ${endDate}
          ${brandFilter}
          ${orgFilter}
        GROUP BY "platform", EXTRACT(HOUR FROM "date")
      ),
      ranked AS (
        SELECT
          platform,
          hour,
          avg_engagement_rate,
          post_count,
          ROW_NUMBER() OVER (PARTITION BY platform ORDER BY avg_engagement_rate DESC, post_count DESC) AS rn
        FROM hour_stats
      )
      SELECT platform, hour, avg_engagement_rate, post_count
      FROM ranked
      WHERE rn = 1
      ORDER BY platform ASC
    `;

    return analyticsResponseProjection.buildBestPostingTimes(results);
  }

  /**
   * Get top performing content
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getTopContent(
    startDateStr?: string,
    endDateStr?: string,
    limit = 10,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.LIKES = AnalyticsMetric.VIEWS,
    brandId?: string,
    platform?: CredentialPlatform,
    organizationId?: string,
  ): Promise<unknown[]> {
    // Enforce maximum limit to prevent excessive data fetching
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const sortExpr = this.postAnalyticsTopContentSortExpression(metric);
    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
      'pa',
    );
    const platformFilter = this.postAnalyticsOptionalPlatformFilter(
      platform,
      'pa',
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
      'pa',
    );

    const results = await this.fetchTopContent(
      startDate,
      endDate,
      safeLimit,
      sortExpr,
      brandFilter,
      platformFilter,
      orgFilter,
    );

    return analyticsResponseProjection.buildTopContent(results);
  }

  private async fetchTopContent(
    startDate: Date,
    endDate: Date,
    safeLimit: number,
    sortExpr: PrismaSql,
    brandFilter: PrismaSql,
    platformFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow[]> {
    const results = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        pa.id,
        pa."postId" AS post_id,
        pa."platform"::text AS platform,
        pa."date",
        pa."totalViews" AS total_views,
        pa."totalLikes" AS total_likes,
        pa."totalComments" AS total_comments,
        pa."totalSaves" AS total_saves,
        pa."totalShares" AS total_shares,
        pa."engagementRate" AS engagement_rate,
        (pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
        p.label AS label,
        p.description AS description,
        b.label AS brand_name,
        NULL AS brand_logo
      FROM "post_analytics" pa
      LEFT JOIN "posts" p ON p.id = pa."postId"
      LEFT JOIN "brands" b ON b.id = pa."brandId"
      WHERE pa."date" >= ${startDate}
        AND pa."date" <= ${endDate}
        ${brandFilter}
        ${platformFilter}
        ${orgFilter}
      ORDER BY ${sortExpr}
      LIMIT ${safeLimit}
    `;

    return results;
  }

  /**
   * Get platform comparison data
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getPlatformComparison(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<unknown> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    const results = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        "platform"::text AS platform,
        AVG("engagementRate") AS avg_engagement_rate,
        SUM("totalComments") AS total_comments,
        SUM("totalLikes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("totalSaves") AS total_saves,
        SUM("totalShares") AS total_shares,
        SUM("totalViews") AS total_views,
        SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY "platform"
      ORDER BY SUM("totalViews") DESC
    `;

    return analyticsResponseProjection.buildPlatformComparison(results);
  }

  /**
   * Get growth trends over time
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getGrowthTrends(
    startDateStr?: string,
    endDateStr?: string,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.POSTS = AnalyticsMetric.VIEWS,
    brandId?: string,
    organizationId?: string,
  ): Promise<unknown> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      DateRangeUtil.parseDateRange(startDateStr, endDateStr);

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    const currentResults = await this.fetchGrowthCurrent(
      startDate,
      endDate,
      brandFilter,
      orgFilter,
    );
    const previous = await this.fetchGrowthPrevious(
      previousStartDate,
      previousEndDate,
      brandFilter,
      orgFilter,
    );

    return {
      data: analyticsResponseProjection.buildGrowthTrends(
        currentResults,
        previous,
        metric,
      ),
      endDate: endDate.toISOString().split('T')[0],
      metric,
      startDate: startDate.toISOString().split('T')[0],
    };
  }

  private async fetchGrowthCurrent(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow[]> {
    const currentResults = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        TO_CHAR("date", 'YYYY-MM-DD') AS day,
        SUM("totalComments") AS comments,
        SUM("totalLikes") AS likes,
        COUNT(*) AS posts,
        SUM("totalSaves") AS saves,
        SUM("totalShares") AS shares,
        SUM("totalViews") AS views,
        SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS engagement
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY TO_CHAR("date", 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    return currentResults;
  }

  private async fetchGrowthPrevious(
    previousStartDate: Date,
    previousEndDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow> {
    const previousResults = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        SUM("totalComments") AS total_comments,
        SUM("totalLikes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("totalSaves") AS total_saves,
        SUM("totalShares") AS total_shares,
        SUM("totalViews") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${previousStartDate} AND "date" <= ${previousEndDate}
        ${brandFilter}
        ${orgFilter}
    `;

    return (
      previousResults[0] || {
        total_comments: 0,
        total_likes: 0,
        total_posts: 0,
        total_saves: 0,
        total_shares: 0,
        total_views: 0,
      }
    );
  }

  /**
   * Get engagement breakdown by type
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getEngagementBreakdown(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    platform?: CredentialPlatform,
    organizationId?: string,
  ): Promise<unknown> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const platformFilter = this.postAnalyticsOptionalPlatformFilter(platform);
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    const results = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        SUM("totalComments") AS total_comments,
        SUM("totalLikes") AS total_likes,
        SUM("totalSaves") AS total_saves,
        SUM("totalShares") AS total_shares
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${platformFilter}
        ${orgFilter}
    `;

    return analyticsResponseProjection.buildEngagementBreakdown(results[0]);
  }

  /**
   * Get viral hooks analysis.
   * Extracts hook text (first sentence of description) from top-performing posts,
   * groups by hook pattern, and ranks by average engagement.
   */
  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async getViralHooks(
    startDateStr?: string,
    endDateStr?: string,
    brandId?: string,
    organizationId?: string,
  ): Promise<ViralHooksResult> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
      'pa',
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
      'pa',
    );

    // Get top performing posts with description data
    const videos = await this.fetchViralHookVideos(
      startDate,
      endDate,
      brandFilter,
      orgFilter,
    );
    // Platform aggregation
    const topPlatformsRaw = await this.fetchViralHookPlatforms(
      startDate,
      endDate,
      brandFilter,
      orgFilter,
    );

    return analyticsResponseProjection.buildViralHooks(videos, topPlatformsRaw);
  }

  private async fetchViralHookVideos(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow[]> {
    // Get top performing posts with description data
    const videos = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        pa."postId" AS id,
        ARRAY_AGG(DISTINCT pa."platform"::text) AS platforms,
        SUM(pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
        SUM(pa."totalViews") AS total_views,
        p.description AS description,
        p.label AS title
      FROM "post_analytics" pa
      LEFT JOIN "posts" p ON p.id = pa."postId"
      WHERE pa."date" >= ${startDate} AND pa."date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY pa."postId", p.description, p.label
      ORDER BY total_engagement DESC
      LIMIT 50
    `;

    return videos;
  }

  private async fetchViralHookPlatforms(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawAnalyticsRow[]> {
    // Platform aggregation
    const topPlatformsRaw = await this.prisma.$queryRaw<RawAnalyticsRow[]>`
      SELECT
        pa."platform"::text AS platform,
        COUNT(*) AS post_count,
        SUM(pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
        SUM(pa."totalViews") AS total_views
      FROM "post_analytics" pa
      WHERE pa."date" >= ${startDate} AND pa."date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
      GROUP BY pa."platform"
      ORDER BY total_engagement DESC
      LIMIT 5
    `;

    return topPlatformsRaw;
  }
}
