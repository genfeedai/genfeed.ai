import {
  ViralHookPlatformMetricsEntity,
  ViralHookSummaryEntity,
} from '@api/collections/posts/entities/viral-hooks.entity';
import type { PostAnalyticsDocument } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric } from '@genfeedai/enums';
import type { IViralHookPlatformAggResult } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface OverviewMetrics {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  totalEngagement: number;
  viewsGrowth: number;
  engagementGrowth: number;
  activePlatforms: string[];
  bestPerformingPlatform: string;
}

export interface TimeSeriesDataPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  totalEngagement: number;
}

export interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

export interface TimeSeriesDataPointWithPlatforms {
  date: string;
  instagram: PlatformMetrics;
  tiktok: PlatformMetrics;
  youtube: PlatformMetrics;
  facebook: PlatformMetrics;
  twitter: PlatformMetrics;
  linkedin: PlatformMetrics;
  reddit: PlatformMetrics;
  pinterest: PlatformMetrics;
  medium: PlatformMetrics;
}

export interface PlatformComparison {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  postCount: number;
  avgViewsPerPost: number;
}

export interface TopContent {
  postId: string;
  ingredientId: string;
  title: string;
  description: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  publishDate: Date;
  url?: string;
}

export interface GrowthTrends {
  views: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  engagement: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  bestDay: {
    date: string;
    views: number;
  };
  trendingDirection: 'up' | 'down' | 'stable';
}

export interface EngagementBreakdown {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total: number;
  likesPercentage: number;
  commentsPercentage: number;
  sharesPercentage: number;
  savesPercentage: number;
}

type NumericSqlValue = bigint | number | string | null;

type DistinctPostCountRow = {
  post_count: NumericSqlValue;
};

type PlatformComparisonRow = {
  comments: NumericSqlValue;
  engagement_rate: NumericSqlValue;
  likes: NumericSqlValue;
  platform: string | null;
  post_count: NumericSqlValue;
  saves: NumericSqlValue;
  shares: NumericSqlValue;
  views: NumericSqlValue;
};

type PostViewsRow = {
  post_id: string;
  total_views: NumericSqlValue;
};

@Injectable()
export class AnalyticsAggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  private readNumber(value: unknown): number {
    return Number(value ?? 0);
  }

  private readDateKey(date: Date, groupBy: 'day' | 'week'): string {
    if (groupBy === 'day') {
      return new Date(date).toISOString().split('T')[0];
    }

    const current = new Date(date);
    const year = current.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const days = Math.floor(
      (current.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
    );
    const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
    return `${year}-${String(week).padStart(2, '0')}`;
  }

  private totalEngagementFromSums(sums: {
    totalComments?: unknown;
    totalLikes?: unknown;
    totalShares?: unknown;
  }): number {
    return (
      this.readNumber(sums.totalLikes) +
      this.readNumber(sums.totalComments) +
      this.readNumber(sums.totalShares)
    );
  }

  private buildBrandSqlPredicate(brandId?: string): Prisma.Sql {
    return brandId ? Prisma.sql`AND "brandId" = ${brandId}` : Prisma.empty;
  }

  private buildAliasedBrandSqlPredicate(brandId?: string): Prisma.Sql {
    return brandId ? Prisma.sql`AND pa."brandId" = ${brandId}` : Prisma.empty;
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

    const currentSums =
      (
        currentAggregate as {
          _avg?: { engagementRate?: unknown };
          _sum?: Record<string, unknown>;
        }
      )._sum ?? {};
    const previousSums =
      (previousAggregate as { _sum?: Record<string, unknown> })._sum ?? {};

    const totalViews = this.readNumber(currentSums.totalViews);
    const totalLikes = this.readNumber(currentSums.totalLikes);
    const totalComments = this.readNumber(currentSums.totalComments);
    const totalSaves = this.readNumber(currentSums.totalSaves);
    const totalShares = this.readNumber(currentSums.totalShares);
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate = this.readNumber(
      (
        currentAggregate as {
          _avg?: { engagementRate?: unknown };
        }
      )._avg?.engagementRate,
    );
    const activePlatforms = (platformRows as Array<{ platform: string }>).map(
      (row) => row.platform,
    );
    const bestPlatform = activePlatforms[0] ?? 'N/A';
    const prevViews = this.readNumber(previousSums.totalViews);
    const prevEngagement = this.totalEngagementFromSums(previousSums);

    const viewsGrowth =
      prevViews > 0 ? ((totalViews - prevViews) / prevViews) * 100 : 0;
    const engagementGrowth =
      prevEngagement > 0
        ? ((totalEngagement - prevEngagement) / prevEngagement) * 100
        : 0;

    return {
      activePlatforms,
      avgEngagementRate,
      bestPerformingPlatform: bestPlatform,
      engagementGrowth,
      totalComments,
      totalEngagement,
      totalLikes,
      totalPosts: postCount,
      totalSaves,
      totalShares,
      totalViews,
      viewsGrowth,
    };
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

    const grouped = new Map<
      string,
      {
        comments: number;
        engagementRate: number;
        likes: number;
        rowCount: number;
        saves: number;
        shares: number;
        views: number;
      }
    >();

    for (const row of rows as Array<{
      _avg?: { engagementRate?: unknown };
      _sum?: Record<string, unknown>;
      date: Date;
    }>) {
      const dateKey = this.readDateKey(row.date, groupBy);
      const sums = row._sum ?? {};
      const engagementRate = this.readNumber(row._avg?.engagementRate);
      const existing = grouped.get(dateKey);
      if (existing) {
        existing.views += this.readNumber(sums.totalViews);
        existing.likes += this.readNumber(sums.totalLikes);
        existing.comments += this.readNumber(sums.totalComments);
        existing.shares += this.readNumber(sums.totalShares);
        existing.saves += this.readNumber(sums.totalSaves);
        existing.engagementRate += engagementRate;
        existing.rowCount += 1;
      } else {
        grouped.set(dateKey, {
          comments: this.readNumber(sums.totalComments),
          engagementRate,
          likes: this.readNumber(sums.totalLikes),
          rowCount: 1,
          saves: this.readNumber(sums.totalSaves),
          shares: this.readNumber(sums.totalShares),
          views: this.readNumber(sums.totalViews),
        });
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => {
        const engagementRate =
          data.rowCount > 0 ? data.engagementRate / data.rowCount : 0;
        return {
          comments: data.comments,
          date,
          engagementRate,
          likes: data.likes,
          saves: data.saves,
          shares: data.shares,
          totalEngagement: data.likes + data.comments + data.shares,
          views: data.views,
        };
      });
  }

  /**
   * Generate date scaffolding for a date range
   */
  private generateDateScaffolding(
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' = 'day',
  ): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      if (groupBy === 'day') {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      } else {
        const year = current.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor(
          (current.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        dates.push(`${year}-${String(week).padStart(2, '0')}`);
        current.setDate(current.getDate() + 7);
      }
    }

    return dates;
  }

  /**
   * Calculate growth percentage between current and previous values
   */
  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    }
    return current > 0 ? 100 : 0;
  }

  /**
   * Create empty platform metrics object
   */
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

    const dataMap = new Map<string, Map<string, PlatformMetrics>>();

    for (const row of rows as Array<{
      _avg?: { engagementRate?: unknown };
      _sum?: Record<string, unknown>;
      date: Date;
      platform: string;
    }>) {
      const dateKey = this.readDateKey(row.date, groupBy);
      const sums = row._sum ?? {};
      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, new Map());
      }

      const platformMap = dataMap.get(dateKey)!;
      const existing = platformMap.get(row.platform);
      if (existing) {
        existing.views += this.readNumber(sums.totalViews);
        existing.likes += this.readNumber(sums.totalLikes);
        existing.comments += this.readNumber(sums.totalComments);
        existing.shares += this.readNumber(sums.totalShares);
        existing.saves += this.readNumber(sums.totalSaves);
        existing.engagementRate = this.readNumber(row._avg?.engagementRate);
      } else {
        platformMap.set(row.platform, {
          comments: this.readNumber(sums.totalComments),
          engagementRate: this.readNumber(row._avg?.engagementRate),
          likes: this.readNumber(sums.totalLikes),
          saves: this.readNumber(sums.totalSaves),
          shares: this.readNumber(sums.totalShares),
          views: this.readNumber(sums.totalViews),
        });
      }
    }

    const allDates = this.generateDateScaffolding(startDate, endDate, groupBy);

    return allDates.map((date) => {
      const platformData =
        dataMap.get(date) || new Map<string, PlatformMetrics>();

      return {
        date,
        facebook:
          platformData.get('facebook') || this.createEmptyPlatformMetrics(),
        instagram:
          platformData.get('instagram') || this.createEmptyPlatformMetrics(),
        linkedin:
          platformData.get('linkedin') || this.createEmptyPlatformMetrics(),
        medium: platformData.get('medium') || this.createEmptyPlatformMetrics(),
        pinterest:
          platformData.get('pinterest') || this.createEmptyPlatformMetrics(),
        reddit: platformData.get('reddit') || this.createEmptyPlatformMetrics(),
        tiktok: platformData.get('tiktok') || this.createEmptyPlatformMetrics(),
        twitter:
          platformData.get('twitter') || this.createEmptyPlatformMetrics(),
        youtube:
          platformData.get('youtube') || this.createEmptyPlatformMetrics(),
      };
    });
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

    return rows.map((row) => {
      const postCount = this.readNumber(row.post_count);
      const views = this.readNumber(row.views);

      return {
        avgViewsPerPost: postCount > 0 ? views / postCount : 0,
        comments: this.readNumber(row.comments),
        engagementRate: this.readNumber(row.engagement_rate),
        likes: this.readNumber(row.likes),
        platform: row.platform || 'unknown',
        postCount,
        saves: this.readNumber(row.saves),
        shares: this.readNumber(row.shares),
        views,
      };
    });
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

    const scored = (
      rows as Array<{
        _avg?: { engagementRate?: unknown };
        _max?: Record<string, unknown>;
        platform: string;
        postId: string;
      }>
    ).map((row) => {
      const max = row._max ?? {};
      const likes = this.readNumber(max.totalLikes);
      const comments = this.readNumber(max.totalComments);
      const shares = this.readNumber(max.totalShares);
      const totalEngagement = likes + comments + shares;

      return {
        avgEngagementRate: this.readNumber(row._avg?.engagementRate),
        comments,
        likes,
        platform: row.platform,
        postId: row.postId,
        shares,
        totalEngagement,
        views: this.readNumber(max.totalViews),
      };
    });

    // Sort by metric
    const sorted =
      metric === AnalyticsMetric.ENGAGEMENT
        ? scored.sort((a, b) => b.totalEngagement - a.totalEngagement)
        : scored.sort((a, b) => b.views - a.views);

    const topScored = sorted.slice(0, safeLimit);

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

    const postMap2 = new Map(
      (
        posts as unknown as Array<{
          id: string;
          description?: string;
          label?: string;
          publicationDate?: Date;
          url?: string;
        }>
      ).map((p) => [p.id, p]),
    );

    return topScored.map((item) => {
      const post = postMap2.get(item.postId);
      return {
        comments: item.comments,
        description: post?.description || '',
        engagementRate: item.avgEngagementRate,
        ingredientId: '',
        likes: item.likes,
        platform: item.platform,
        postId: item.postId,
        publishDate: post?.publicationDate || new Date(),
        shares: item.shares,
        title: post?.label || 'Untitled',
        url: post?.url,
        views: item.views,
      };
    });
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

    const currentSums =
      (currentAggregate as { _sum?: Record<string, unknown> })._sum ?? {};
    const previousSums =
      (previousAggregate as { _sum?: Record<string, unknown> })._sum ?? {};
    const totalViews = this.readNumber(currentSums.totalViews);
    const totalEngagement = this.totalEngagementFromSums(currentSums);
    const prevViews = this.readNumber(previousSums.totalViews);
    const prevEngagement = this.totalEngagementFromSums(previousSums);

    // Best day
    const bestDay = (
      viewsByDateRows as Array<{
        _sum?: { totalViews?: unknown };
        date: Date;
      }>
    )[0];
    const bestDate = bestDay ? this.readDateKey(bestDay.date, 'day') : 'N/A';
    const bestViews = this.readNumber(bestDay?._sum?.totalViews);

    const viewsGrowth = totalViews - prevViews;
    const viewsGrowthPct = prevViews > 0 ? (viewsGrowth / prevViews) * 100 : 0;
    const engGrowth = totalEngagement - prevEngagement;
    const engGrowthPct =
      prevEngagement > 0 ? (engGrowth / prevEngagement) * 100 : 0;

    let trendingDirection: 'up' | 'down' | 'stable' = 'stable';
    if (viewsGrowthPct > 5) {
      trendingDirection = 'up';
    } else if (viewsGrowthPct < -5) {
      trendingDirection = 'down';
    }

    return {
      bestDay: { date: bestDate, views: bestViews },
      engagement: {
        current: totalEngagement,
        growth: engGrowth,
        growthPercentage: engGrowthPct,
        previous: prevEngagement,
      },
      trendingDirection,
      views: {
        current: totalViews,
        growth: viewsGrowth,
        growthPercentage: viewsGrowthPct,
        previous: prevViews,
      },
    };
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

    const sums = (aggregate as { _sum?: Record<string, unknown> })._sum ?? {};
    const likes = this.readNumber(sums.totalLikes);
    const comments = this.readNumber(sums.totalComments);
    const shares = this.readNumber(sums.totalShares);
    const saves = this.readNumber(sums.totalSaves);

    const total = likes + comments + shares + saves;

    return {
      comments,
      commentsPercentage: total > 0 ? (comments / total) * 100 : 0,
      likes,
      likesPercentage: total > 0 ? (likes / total) * 100 : 0,
      saves,
      savesPercentage: total > 0 ? (saves / total) * 100 : 0,
      shares,
      sharesPercentage: total > 0 ? (shares / total) * 100 : 0,
      total,
    };
  }

  async getViralHooksSummary(
    organizationId: string,
    brandId?: string,
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Promise<ViralHookSummaryEntity> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) where.brandId = brandId;

    const topPostRows = await this.prisma.$queryRaw<PostViewsRow[]>(
      Prisma.sql`
        WITH per_platform AS (
          SELECT
            "postId",
            "platform",
            MAX("totalViews") AS views
          FROM "post_analytics"
          WHERE "organizationId" = ${organizationId}
            AND "date" >= ${startDate}
            AND "date" <= ${endDate}
            ${this.buildBrandSqlPredicate(brandId)}
          GROUP BY "postId", "platform"
        )
        SELECT
          "postId" AS post_id,
          SUM(views) AS total_views
        FROM per_platform
        GROUP BY "postId"
        ORDER BY total_views DESC
        LIMIT 25
      `,
    );

    const postIds = topPostRows.map((row) => row.post_id);

    const platformRows =
      postIds.length > 0
        ? await this.prisma.postAnalytics.groupBy({
            _avg: { engagementRate: true },
            _max: {
              totalComments: true,
              totalLikes: true,
              totalSaves: true,
              totalShares: true,
              totalViews: true,
            },
            by: ['postId', 'platform'],
            where: {
              ...where,
              postId: { in: postIds },
            } as never,
          } as never)
        : [];

    const postPlatformMap = new Map<
      string,
      Map<
        string,
        {
          comments: number;
          engagementRate: number;
          likes: number;
          saves: number;
          shares: number;
          views: number;
        }
      >
    >();

    for (const row of platformRows as Array<{
      _avg?: { engagementRate?: unknown };
      _max?: Record<string, unknown>;
      platform: string;
      postId: string;
    }>) {
      const max = row._max ?? {};
      const platformMap = postPlatformMap.get(row.postId) ?? new Map();
      platformMap.set(row.platform, {
        comments: this.readNumber(max.totalComments),
        engagementRate: this.readNumber(row._avg?.engagementRate),
        likes: this.readNumber(max.totalLikes),
        saves: this.readNumber(max.totalSaves),
        shares: this.readNumber(max.totalShares),
        views: this.readNumber(max.totalViews),
      });
      postPlatformMap.set(row.postId, platformMap);
    }

    const ranked = topPostRows.map((row) => ({
      platforms: postPlatformMap.get(row.post_id) ?? new Map(),
      postId: row.post_id,
      totalViews: this.readNumber(row.total_views),
    }));

    // Fetch post details
    const posts = await this.prisma.post.findMany({
      select: {
        createdAt: true,
        description: true,
        id: true,
        label: true,
        publicationDate: true,
        url: true,
      },
      take: postIds.length,
      where: { id: { in: postIds } },
    });

    const postsById = new Map(
      (
        posts as unknown as Array<{
          id: string;
          createdAt?: Date;
          description?: string;
          label?: string;
          publicationDate?: Date;
          url?: string;
        }>
      ).map((p) => [p.id, p]),
    );

    const toIsoString = (value?: Date | string | null): string => {
      if (!value) return new Date().toISOString();
      if (value instanceof Date) return value.toISOString();
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? new Date().toISOString()
        : parsed.toISOString();
    };

    const videos = ranked.map((item) => {
      const post = postsById.get(item.postId);
      const platforms = Array.from(item.platforms.entries()).map(
        ([platform, data]) => {
          const viralScore = Math.min(
            100,
            Math.round(data.engagementRate * 5 + data.views / 1000),
          );

          return {
            avgWatchTime: 0,
            comments: data.comments,
            completionRate: 0,
            engagementRate: data.engagementRate,
            likes: data.likes,
            platform: platform.toLowerCase(),
            saves: data.saves,
            shares: data.shares,
            views: data.views,
            viralScore,
          };
        },
      );

      const publishDate =
        post?.publicationDate ?? post?.createdAt ?? new Date();

      return {
        analysisNotes: undefined,
        creator: 'Unknown Creator',
        duration: 0,
        hooks: [],
        id: item.postId,
        platforms,
        thumbnail: undefined,
        title: post?.label ?? post?.description ?? 'Untitled Video',
        totalTimeTracked: 0,
        uploadDate: toIsoString(publishDate),
      };
    });

    const totalVideos = videos.length;
    const totalTimeTracked = 0;

    const platformStats = new Map<
      string,
      { totalViews: number; totalViralScore: number; count: number }
    >();

    videos.forEach((video) => {
      video.platforms.forEach((platform: ViralHookPlatformMetricsEntity) => {
        const stats = platformStats.get(platform.platform) ?? {
          count: 0,
          totalViews: 0,
          totalViralScore: 0,
        };

        stats.totalViews += platform.views;
        stats.totalViralScore += platform.viralScore;
        stats.count += 1;

        platformStats.set(platform.platform, stats);
      });
    });

    const topPlatforms = Array.from(platformStats.entries())
      .map(([platform, stats]) => ({
        avgViralScore:
          stats.count > 0
            ? Number((stats.totalViralScore / stats.count).toFixed(1))
            : 0,
        platform,
        totalViews: stats.totalViews,
      }))
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 5);

    return new ViralHookSummaryEntity({
      analysis: {
        avgTimePerVideo:
          totalVideos > 0
            ? Math.round(totalTimeTracked / Math.max(totalVideos, 1))
            : 0,
        hookEffectiveness: [],
        topHooks: [],
        topPlatforms,
        totalTime: totalTimeTracked,
        totalVideos,
      },
      videos,
    });
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

    const currentSums =
      (currentAggregate as { _sum?: Record<string, unknown> })._sum ?? {};
    const previousSums =
      (previousAggregate as { _sum?: Record<string, unknown> })._sum ?? {};
    const totalViews = this.readNumber(currentSums.totalViews);
    const totalLikes = this.readNumber(currentSums.totalLikes);
    const totalComments = this.readNumber(currentSums.totalComments);
    const totalSaves = this.readNumber(currentSums.totalSaves);
    const totalShares = this.readNumber(currentSums.totalShares);
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate = this.readNumber(
      (
        currentAggregate as {
          _avg?: { engagementRate?: unknown };
        }
      )._avg?.engagementRate,
    );
    const prevViews = this.readNumber(previousSums.totalViews);
    const prevEngagement = this.totalEngagementFromSums(previousSums);
    const totalPosts = this.readNumber(postCountRows[0]?.post_count);

    return {
      activePlatforms: [platform],
      avgEngagementRate,
      bestPerformingPlatform: platform,
      engagementGrowth: this.calculateGrowthPercentage(
        totalEngagement,
        prevEngagement,
      ),
      totalComments,
      totalEngagement,
      totalLikes,
      totalPosts,
      totalSaves,
      totalShares,
      totalViews,
      viewsGrowth: this.calculateGrowthPercentage(totalViews, prevViews),
    };
  }
}
