import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PrismaSql = ReturnType<typeof Prisma.sql>;
type PostAnalyticsTextColumn = 'brandId' | 'organizationId';
type RawRow = Record<string, unknown>;

interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

/** Platform metrics for time series */
interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

export type AnalyticsBestPostingTime = {
  avgEngagementRate: number;
  hour: number;
  platform: string;
  postCount: number;
};

/** One viral-hook video projection */
type ViralHookVideo = {
  description: string;
  hook: string;
  id: string;
  platforms: string[];
  title: string;
  totalEngagement: number;
  totalViews: number;
};

/** Aggregated effectiveness of a single hook pattern */
type HookEffectiveness = {
  hook: string;
  avgEngagement: number;
  avgViews: number;
  postCount: number;
};

type TopPlatformSummary = {
  platform: string;
  postCount: number;
  totalEngagement: number;
  totalViews: number;
};

type ViralHooksResult = {
  analysis: {
    hookEffectiveness: HookEffectiveness[];
    topHooks: Array<{ hook: string; avgEngagement: number; postCount: number }>;
    topPlatforms: TopPlatformSummary[];
    totalVideos: number;
  };
  videos: ViralHookVideo[];
};

@Injectable()
export class AnalyticsService extends BaseService<Record<string, unknown>> {
  constructor(
    protected readonly prisma: PrismaService,
    configService: ConfigService,
    logger: LoggerService,
  ) {
    super(prisma, 'analytic', logger, configService);
  }

  /**
   * Parse date range from optional startDate/endDate strings
   * Uses DateRangeUtil helper with default D-7 to D-1
   */
  private parseDateRange(
    startDateStr?: string,
    endDateStr?: string,
  ): DateRange {
    return DateRangeUtil.parseDateRange(startDateStr, endDateStr);
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
  ): Promise<unknown[]> {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999); // Include the entire end date (UTC)

    // Aggregate timeseries data across all organizations and platforms using raw SQL
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const rawResults: any[] = await this.prisma.$queryRaw`
      SELECT
        TO_CHAR("date", 'YYYY-MM-DD') AS day,
        "platform"::text AS platform,
        SUM("totalComments") AS comments,
        AVG("engagementRate") AS engagement_rate,
        SUM("totalLikes") AS likes,
        SUM("totalSaves") AS saves,
        SUM("totalShares") AS shares,
        SUM("totalViews") AS views
      FROM "post_analytics"
      WHERE "date" >= ${start}
        AND "date" <= ${end}
        ${this.postAnalyticsOptionalTextFilter('organizationId', organizationId)}
      GROUP BY TO_CHAR("date", 'YYYY-MM-DD'), "platform"
      ORDER BY day ASC
    `;

    // Generate date scaffolding
    const allDates = this.generateDateScaffolding(start, end);

    // Build a nested map: date -> platform -> metrics
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();
    for (const row of rawResults) {
      const day = row.day as string;
      const platform = row.platform as string;
      if (!dataMap.has(day)) {
        dataMap.set(day, new Map<string, PlatformMetrics>());
      }
      dataMap.get(day)!.set(platform, {
        comments: Number(row.comments),
        engagementRate: Number(row.engagement_rate) || 0,
        likes: Number(row.likes),
        saves: Number(row.saves),
        shares: Number(row.shares),
        views: Number(row.views),
      });
    }

    // Build response with all dates and platforms
    return allDates.map((date) =>
      this.buildTimeSeriesRow(
        date,
        dataMap.get(date) || new Map<string, PlatformMetrics>(),
      ),
    );
  }

  /** Project a single day's platform map into the fixed 9-platform output row */
  private buildTimeSeriesRow(
    date: string,
    platformData: Map<string, PlatformMetrics>,
  ): Record<string, unknown> {
    return {
      date,
      facebook:
        platformData.get(CredentialPlatform.FACEBOOK) ||
        this.createEmptyPlatformMetrics(),
      instagram:
        platformData.get(CredentialPlatform.INSTAGRAM) ||
        this.createEmptyPlatformMetrics(),
      linkedin:
        platformData.get(CredentialPlatform.LINKEDIN) ||
        this.createEmptyPlatformMetrics(),
      medium:
        platformData.get(CredentialPlatform.MEDIUM) ||
        this.createEmptyPlatformMetrics(),
      pinterest:
        platformData.get(CredentialPlatform.PINTEREST) ||
        this.createEmptyPlatformMetrics(),
      reddit:
        platformData.get(CredentialPlatform.REDDIT) ||
        this.createEmptyPlatformMetrics(),
      tiktok:
        platformData.get(CredentialPlatform.TIKTOK) ||
        this.createEmptyPlatformMetrics(),
      twitter:
        platformData.get(CredentialPlatform.TWITTER) ||
        this.createEmptyPlatformMetrics(),
      youtube:
        platformData.get(CredentialPlatform.YOUTUBE) ||
        this.createEmptyPlatformMetrics(),
    };
  }

  private generateDateScaffolding(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private createEmptyPlatformMetrics(): PlatformMetrics {
    return {
      comments: 0,
      engagementRate: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      views: 0,
    };
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
      this.parseDateRange(startDateStr, endDateStr);

    // Build conditional WHERE fragments
    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const orgFilter = this.postAnalyticsOptionalTextFilter(
      'organizationId',
      organizationId,
    );

    const current = await this.fetchOverviewCurrentMetrics(
      startDate,
      endDate,
      brandFilter,
      orgFilter,
    );
    const previous = await this.fetchOverviewPreviousMetrics(
      previousStartDate,
      previousEndDate,
      brandFilter,
      orgFilter,
    );

    const metrics = this.computeOverviewMetrics(current, previous);
    const { brandCount, orgCount } =
      await this.countOverviewEntities(organizationId);

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
  ): Promise<RawRow> {
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const currentMetrics: any[] = await this.prisma.$queryRaw`
      SELECT
        AVG("engagementRate") AS avg_engagement_rate,
        SUM("totalComments") AS total_comments,
        SUM("totalLikes") AS total_likes,
        COUNT(*) AS total_posts,
        SUM("totalSaves") AS total_saves,
        SUM("totalShares") AS total_shares,
        SUM("totalViews") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${orgFilter}
    `;

    return (
      currentMetrics[0] || {
        avg_engagement_rate: 0,
        total_comments: 0,
        total_likes: 0,
        total_posts: 0,
        total_saves: 0,
        total_shares: 0,
        total_views: 0,
      }
    );
  }

  private async fetchOverviewPreviousMetrics(
    previousStartDate: Date,
    previousEndDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawRow> {
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const previousMetrics: any[] = await this.prisma.$queryRaw`
      SELECT
        SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement,
        COUNT(*) AS total_posts,
        SUM("totalViews") AS total_views
      FROM "post_analytics"
      WHERE "date" >= ${previousStartDate} AND "date" <= ${previousEndDate}
        ${brandFilter}
        ${orgFilter}
    `;

    return (
      previousMetrics[0] || {
        total_engagement: 0,
        total_posts: 0,
        total_views: 0,
      }
    );
  }

  private computeOverviewMetrics(
    current: RawRow,
    previous: RawRow,
  ): {
    avgEngagementRate: number;
    growth: { engagement: number; posts: number; views: number };
    totalEngagement: number;
    totalPosts: number;
    totalViews: number;
  } {
    const totalLikes = Number(current.total_likes);
    const totalComments = Number(current.total_comments);
    const totalShares = Number(current.total_shares);
    const totalSaves = Number(current.total_saves);
    const totalEngagement =
      totalLikes + totalComments + totalShares + totalSaves;
    const totalPosts = Number(current.total_posts);
    const totalViews = Number(current.total_views);
    const prevEngagement = Number(previous.total_engagement);
    const prevPosts = Number(previous.total_posts);
    const prevViews = Number(previous.total_views);

    const postsGrowth =
      prevPosts > 0 ? ((totalPosts - prevPosts) / prevPosts) * 100 : 0;
    const viewsGrowth =
      prevViews > 0 ? ((totalViews - prevViews) / prevViews) * 100 : 0;
    const engagementGrowth =
      prevEngagement > 0
        ? ((totalEngagement - prevEngagement) / prevEngagement) * 100
        : 0;

    return {
      avgEngagementRate: Number(current.avg_engagement_rate) || 0,
      growth: {
        engagement: engagementGrowth,
        posts: postsGrowth,
        views: viewsGrowth,
      },
      totalEngagement,
      totalPosts,
      totalViews,
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
    const { startDate, endDate } = this.parseDateRange(
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
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
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

    return results.map((row) => ({
      avgEngagementRate: Number(
        (Number(row.avg_engagement_rate) || 0).toFixed(2),
      ),
      hour: Number(row.hour),
      platform: row.platform as string,
      postCount: Number(row.post_count),
    }));
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
    const { startDate, endDate } = this.parseDateRange(
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

    return results.map((row) => ({
      _id: row.id as string,
      brandName: row.brand_name as string,
      brandLogo: row.brand_logo as unknown,
      date: row.date as Date,
      description: row.description as string,
      engagementRate: Number(row.engagement_rate),
      label: row.label as string,
      platform: row.platform as string,
      postId: row.post_id as string,
      thumbnailUrl: undefined,
      ingredientUrl: undefined,
      isVideo: false,
      totalComments: Number(row.total_comments),
      totalEngagement: Number(row.total_engagement),
      totalLikes: Number(row.total_likes),
      totalSaves: Number(row.total_saves),
      totalShares: Number(row.total_shares),
      totalViews: Number(row.total_views),
    }));
  }

  private async fetchTopContent(
    startDate: Date,
    endDate: Date,
    safeLimit: number,
    sortExpr: PrismaSql,
    brandFilter: PrismaSql,
    platformFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawRow[]> {
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        pa.id,
        pa."postId" AS post_id,
        pa."platform"::text AS platform,
        pa."date",
        pa."totalViews",
        pa."totalLikes",
        pa."totalComments",
        pa."totalSaves",
        pa."totalShares",
        pa."engagementRate",
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
  ): Promise<unknown> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
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
      GROUP BY "platform"
      ORDER BY SUM("totalViews") DESC
    `;

    // Calculate totals for percentage calculation
    const totals = results.reduce(
      (acc, platform) => {
        acc.views += Number(platform.total_views);
        acc.engagement += Number(platform.total_engagement);
        acc.posts += Number(platform.total_posts);
        return acc;
      },
      { engagement: 0, posts: 0, views: 0 },
    );

    // Add percentages to each platform
    return results.map((platform) => {
      const totalViews = Number(platform.total_views);
      const totalEngagement = Number(platform.total_engagement);
      const totalPosts = Number(platform.total_posts);
      return {
        avgEngagementRate: Number(platform.avg_engagement_rate) || 0,
        engagementPercentage:
          totals.engagement > 0
            ? (totalEngagement / totals.engagement) * 100
            : 0,
        platform: platform.platform as string,
        postsPercentage:
          totals.posts > 0 ? (totalPosts / totals.posts) * 100 : 0,
        totalEngagement,
        totalPosts,
        totalViews,
        viewsPercentage:
          totals.views > 0 ? (totalViews / totals.views) * 100 : 0,
      };
    });
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
  ): Promise<unknown> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(startDateStr, endDateStr);

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );

    const currentResults = await this.fetchGrowthCurrent(
      startDate,
      endDate,
      brandFilter,
    );
    const previous = await this.fetchGrowthPrevious(
      previousStartDate,
      previousEndDate,
      brandFilter,
    );

    return {
      data: this.buildGrowthTrends(currentResults, previous, metric),
      endDate: endDate.toISOString().split('T')[0],
      metric,
      startDate: startDate.toISOString().split('T')[0],
    };
  }

  private async fetchGrowthCurrent(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
  ): Promise<RawRow[]> {
    // Current period: group by day
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const currentResults: any[] = await this.prisma.$queryRaw`
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
      GROUP BY TO_CHAR("date", 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    return currentResults;
  }

  private async fetchGrowthPrevious(
    previousStartDate: Date,
    previousEndDate: Date,
    brandFilter: PrismaSql,
  ): Promise<RawRow> {
    // Previous period: aggregate totals
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const previousResults: any[] = await this.prisma.$queryRaw`
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

  private buildGrowthTrends(
    currentResults: RawRow[],
    previous: RawRow,
    metric:
      | AnalyticsMetric.VIEWS
      | AnalyticsMetric.ENGAGEMENT
      | AnalyticsMetric.POSTS,
  ): Array<{ date: string; growth: number; trend: string; value: number }> {
    const prevEngagement =
      Number(previous.total_likes) +
      Number(previous.total_comments) +
      Number(previous.total_shares) +
      Number(previous.total_saves);

    // Calculate growth for each day
    return currentResults.map((day) => {
      let growth = 0;
      let previousValue = 0;
      let currentValue = 0;

      switch (metric) {
        case AnalyticsMetric.ENGAGEMENT:
          previousValue = prevEngagement;
          currentValue = Number(day.engagement);
          break;
        case AnalyticsMetric.POSTS:
          previousValue = Number(previous.total_posts);
          currentValue = Number(day.posts);
          break;
        default:
          previousValue = Number(previous.total_views);
          currentValue = Number(day.views);
      }

      if (previousValue > 0) {
        growth = ((currentValue - previousValue) / previousValue) * 100;
      }

      return {
        date: day.day as string,
        growth,
        trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable',
        value: currentValue,
      };
    });
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
  ): Promise<unknown> {
    const { startDate, endDate } = this.parseDateRange(
      startDateStr,
      endDateStr,
    );

    const brandFilter = this.postAnalyticsOptionalTextFilter(
      'brandId',
      brandId,
    );
    const platformFilter = this.postAnalyticsOptionalPlatformFilter(platform);

    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const results: any[] = await this.prisma.$queryRaw`
      SELECT
        SUM("totalComments") AS total_comments,
        SUM("totalLikes") AS total_likes,
        SUM("totalSaves") AS total_saves,
        SUM("totalShares") AS total_shares
      FROM "post_analytics"
      WHERE "date" >= ${startDate} AND "date" <= ${endDate}
        ${brandFilter}
        ${platformFilter}
    `;

    const data = results[0] || {
      total_comments: 0,
      total_likes: 0,
      total_saves: 0,
      total_shares: 0,
    };

    const totalComments = Number(data.total_comments);
    const totalLikes = Number(data.total_likes);
    const totalSaves = Number(data.total_saves);
    const totalShares = Number(data.total_shares);
    const total = totalLikes + totalComments + totalShares + totalSaves;

    return {
      comments: totalComments,
      likes: totalLikes,
      percentages: {
        comments: total > 0 ? (totalComments / total) * 100 : 0,
        likes: total > 0 ? (totalLikes / total) * 100 : 0,
        saves: total > 0 ? (totalSaves / total) * 100 : 0,
        shares: total > 0 ? (totalShares / total) * 100 : 0,
      },
      saves: totalSaves,
      shares: totalShares,
      total,
    };
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
    const { startDate, endDate } = this.parseDateRange(
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

    // Extract hook text from each video's description (first sentence/line)
    const videosWithHooks: ViralHookVideo[] = videos.map((v) => ({
      description: (v.description as string) || '',
      hook: this.extractHookFromDescription(v.description as string),
      id: v.id as string,
      platforms: (v.platforms as string[]) || [],
      title: (v.title as string) || 'Untitled',
      totalEngagement: Number(v.total_engagement),
      totalViews: Number(v.total_views),
    }));

    const hookEffectiveness = this.buildHookEffectiveness(videosWithHooks);
    const topHooks = hookEffectiveness.slice(0, 10).map((h) => ({
      avgEngagement: h.avgEngagement,
      hook: h.hook,
      postCount: h.postCount,
    }));

    return {
      analysis: {
        hookEffectiveness,
        topHooks,
        topPlatforms: this.mapTopPlatforms(topPlatformsRaw),
        totalVideos: videosWithHooks.length,
      },
      videos: videosWithHooks,
    };
  }

  private async fetchViralHookVideos(
    startDate: Date,
    endDate: Date,
    brandFilter: PrismaSql,
    orgFilter: PrismaSql,
  ): Promise<RawRow[]> {
    // Get top performing posts with description data
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const videos: any[] = await this.prisma.$queryRaw`
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
  ): Promise<RawRow[]> {
    // Platform aggregation
    // biome-ignore lint/suspicious/noExplicitAny: raw SQL result
    const topPlatformsRaw: any[] = await this.prisma.$queryRaw`
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

  /** Group videos by normalized hook text and rank by average engagement */
  private buildHookEffectiveness(
    videosWithHooks: ViralHookVideo[],
  ): HookEffectiveness[] {
    const hookMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const v of videosWithHooks) {
      if (!v.hook) {
        continue;
      }
      const normalized = v.hook.toLowerCase().trim();
      const existing = hookMap.get(normalized) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };
      existing.totalEngagement += v.totalEngagement;
      existing.totalViews += v.totalViews;
      existing.count += 1;
      hookMap.set(normalized, existing);
    }

    return Array.from(hookMap.entries())
      .map(([hook, stats]) => ({
        avgEngagement: Math.round(stats.totalEngagement / stats.count),
        avgViews: Math.round(stats.totalViews / stats.count),
        hook,
        postCount: stats.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }

  private mapTopPlatforms(rows: RawRow[]): TopPlatformSummary[] {
    return rows.map((p) => ({
      platform: p.platform as string,
      postCount: Number(p.post_count),
      totalEngagement: Number(p.total_engagement),
      totalViews: Number(p.total_views),
    }));
  }

  /**
   * Extract the hook (opening line/sentence) from a post description.
   * The hook is the first sentence that grabs attention.
   */
  private extractHookFromDescription(description?: string): string {
    if (!description || description.trim().length === 0) {
      return '';
    }

    const trimmed = description.trim();

    // Split by newlines first (hooks are often on the first line)
    const firstLine = trimmed.split('\n')[0].trim();

    // If the first line is short enough, use it as the hook
    if (firstLine.length <= 150) {
      return firstLine;
    }

    // Otherwise, extract the first sentence
    const sentenceMatch = firstLine.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch) {
      return sentenceMatch[0].trim();
    }

    // Fallback: truncate to 150 chars
    return firstLine.substring(0, 150);
  }
}
