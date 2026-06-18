import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface WeeklySummaryOptions {
  topN?: number;
  worstN?: number;
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface PerformanceContentItem {
  postId: string;
  title: string;
  description: string;
  platform: string;
  engagementRate: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  publishDate?: Date;
}

export interface PlatformEngagement {
  platform: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface ContentTypeEngagement {
  category: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface PostingTimeAnalysis {
  hour: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface PromptPerformanceItem {
  promptSnippet: string;
  avgEngagementRate: number;
  totalPosts: number;
  totalViews: number;
}

export interface WeeklySummary {
  topPerformers: PerformanceContentItem[];
  worstPerformers: PerformanceContentItem[];
  avgEngagementByPlatform: PlatformEngagement[];
  avgEngagementByContentType: ContentTypeEngagement[];
  bestPostingTimes: PostingTimeAnalysis[];
  topHooks: string[];
  weekOverWeekTrend: {
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  };
}

type DateRangeFilter = {
  gte?: Date;
  lte?: Date;
};

type ContentTypeEngagementRow = {
  avg_engagement_rate: number | string | null;
  category: string | null;
  total_posts: bigint | number | string;
};

type PlatformEngagementRow = {
  avg_engagement_rate: number | string | null;
  platform: string | null;
  total_posts: bigint | number | string;
};

type PostingTimeAnalysisRow = {
  avg_engagement_rate: number | string | null;
  hour: number | string;
  post_count: bigint | number | string;
};

@Injectable()
export class PerformanceSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDateRange(startDate?: Date | string, endDate?: Date | string) {
    return DateRangeUtil.parseDateRange(startDate, endDate);
  }

  private buildMatchFilter(
    organizationId: string,
    brandId: string,
    startDate: Date,
    endDate: Date,
  ): Prisma.PostAnalyticsWhereInput {
    return {
      brandId,
      date: { gte: startDate, lte: endDate },
      organizationId,
    };
  }

  private buildAnalyticsSqlWhere(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Prisma.Sql {
    const dateRange = (matchFilter.date ?? {}) as DateRangeFilter;

    return Prisma.sql`
      pa."organizationId" = ${String(matchFilter.organizationId ?? '')}
      AND pa."brandId" = ${String(matchFilter.brandId ?? '')}
      AND pa."date" >= ${dateRange.gte ?? new Date(0)}
      AND pa."date" <= ${dateRange.lte ?? new Date()}
    `;
  }

  /**
   * Get weekly performance summary with top/worst content, platform breakdown,
   * posting time analysis, and week-over-week trends.
   */
  async getWeeklySummary(
    organizationId: string,
    brandId: string,
    options: WeeklySummaryOptions = {},
  ): Promise<WeeklySummary> {
    const { topN = 5, worstN = 5 } = options;

    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange(options.startDate, options.endDate);

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    const [
      topPerformers,
      worstPerformers,
      avgEngagementByPlatform,
      avgEngagementByContentType,
      bestPostingTimes,
      topHooks,
      weekOverWeekTrend,
    ] = await Promise.all([
      this.getContentByEngagement(matchFilter, topN, 'desc'),
      this.getContentByEngagement(matchFilter, worstN, 'asc'),
      this.getAvgEngagementByPlatform(matchFilter),
      this.getAvgEngagementByContentType(matchFilter),
      this.getBestPostingTimes(matchFilter),
      this.getTopHooks(matchFilter),
      this.getWeekOverWeekTrend(matchFilter, {
        ...matchFilter,
        date: { gte: previousStartDate, lte: previousEndDate },
      }),
    ]);

    return {
      avgEngagementByContentType,
      avgEngagementByPlatform,
      bestPostingTimes,
      topHooks,
      topPerformers,
      weekOverWeekTrend,
      worstPerformers,
    };
  }

  /**
   * Get top performing content ranked by engagement rate.
   */
  async getTopPerformers(
    organizationId: string,
    brandId: string,
    limit: number = 10,
    dateRange?: { startDate?: Date | string; endDate?: Date | string },
  ): Promise<PerformanceContentItem[]> {
    const { startDate, endDate } = this.parseDateRange(
      dateRange?.startDate,
      dateRange?.endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    return this.getContentByEngagement(matchFilter, limit, 'desc');
  }

  /**
   * Get prompt/description performance.
   */
  async getPromptPerformance(
    organizationId: string,
    brandId: string,
    startDate?: Date | string,
    endDate?: Date | string,
  ): Promise<PromptPerformanceItem[]> {
    const { startDate: parsedStart, endDate: parsedEnd } = this.parseDateRange(
      startDate,
      endDate,
    );

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      parsedStart,
      parsedEnd,
    );

    // Fetch post analytics grouped by post, then join with posts
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter,
      orderBy: { engagementRate: 'desc' },
      take: 50,
    });

    // Group by first 100 chars of description/label
    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              description: true,
              id: true,
              label: true,
              publicationDate: true,
            },
            take: postIds.length,
            where: { id: { in: postIds } },
          })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const promptMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const item of analytics) {
      const post = postMap.get(String(item.postId));
      const desc = String(post?.description || post?.label || '').trim();
      if (!desc) continue;

      const snippet = desc.substring(0, 100);
      const existing = promptMap.get(snippet) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };

      existing.totalEngagement += Number(item.engagementRate || 0);
      existing.totalViews += Number(item.totalViews || 0);
      existing.count += 1;
      promptMap.set(snippet, existing);
    }

    return Array.from(promptMap.entries())
      .map(([snippet, data]) => ({
        avgEngagementRate:
          data.count > 0 ? data.totalEngagement / data.count : 0,
        promptSnippet: snippet,
        totalPosts: data.count,
        totalViews: data.totalViews,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }

  /**
   * Generate a text block of performance context for injection into AI generation prompts.
   */
  async generatePerformanceContext(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const { startDate, endDate, previousStartDate, previousEndDate } =
      this.parseDateRange();

    const matchFilter = this.buildMatchFilter(
      organizationId,
      brandId,
      startDate,
      endDate,
    );

    const [topPerformers, platformEngagement, bestTimes, trend] =
      await Promise.all([
        this.getContentByEngagement(matchFilter, 3, 'desc'),
        this.getAvgEngagementByPlatform(matchFilter),
        this.getBestPostingTimes(matchFilter),
        this.getWeekOverWeekTrend(matchFilter, {
          ...matchFilter,
          date: { gte: previousStartDate, lte: previousEndDate },
        }),
      ]);

    const lines: string[] = [];

    if (topPerformers.length > 0) {
      const hooks = topPerformers
        .map((p) => {
          const text = p.title || p.description || '';
          return text.substring(0, 80);
        })
        .filter(Boolean);

      if (hooks.length > 0) {
        lines.push(`Your top hooks last week: [${hooks.join(', ')}].`);
      }
    }

    if (bestTimes.length > 0) {
      const bestHour = bestTimes[0].hour;
      const period = bestHour >= 12 ? 'PM' : 'AM';
      const displayHour = bestHour > 12 ? bestHour - 12 : bestHour || 12;
      lines.push(`Best posting time: ${displayHour}${period}.`);
    }

    if (platformEngagement.length > 0) {
      const best = platformEngagement.sort(
        (a, b) => b.avgEngagementRate - a.avgEngagementRate,
      )[0];
      lines.push(`Best platform: ${best.platform}.`);
    }

    const direction = trend.direction.toUpperCase();
    const pct = Math.abs(trend.percentageChange).toFixed(0);
    lines.push(`Engagement trending ${direction} ${pct}%.`);

    return lines.join(' ') || 'No performance data available yet.';
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async getContentByEngagement(
    matchFilter: Prisma.PostAnalyticsWhereInput,
    limit: number,
    sortDirection: 'asc' | 'desc',
  ): Promise<PerformanceContentItem[]> {
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter,
      orderBy: { engagementRate: sortDirection },
      take: limit,
    });

    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              description: true,
              id: true,
              label: true,
              publicationDate: true,
            },
            take: postIds.length,
            where: { id: { in: postIds } },
          })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    return analytics.map((item) => {
      const post = postMap.get(String(item.postId));
      return {
        comments: Number(item.totalComments || 0),
        description: String(post?.description || ''),
        engagementRate: Number(item.engagementRate || 0),
        likes: Number(item.totalLikes || 0),
        platform: String(item.platform || ''),
        postId: String(item.postId),
        publishDate: post?.publicationDate ?? undefined,
        saves: Number(item.totalSaves || 0),
        shares: Number(item.totalShares || 0),
        title: String(post?.label || ''),
        views: Number(item.totalViews || 0),
      };
    });
  }

  private async getAvgEngagementByPlatform(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<PlatformEngagement[]> {
    const rows = await this.prisma.$queryRaw<PlatformEngagementRow[]>(
      Prisma.sql`
        SELECT
          pa."platform"::text AS platform,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS total_posts
        FROM "post_analytics" pa
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
        GROUP BY pa."platform"
        ORDER BY avg_engagement_rate DESC
        LIMIT 20
      `,
    );

    return rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      platform: row.platform || 'unknown',
      totalPosts: Number(row.total_posts ?? 0),
    }));
  }

  private async getAvgEngagementByContentType(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<ContentTypeEngagement[]> {
    const rows = await this.prisma.$queryRaw<ContentTypeEngagementRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(p."category"::text, 'unknown') AS category,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS total_posts
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p."id" = pa."postId"
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
          AND p."isDeleted" = false
        GROUP BY COALESCE(p."category"::text, 'unknown')
        ORDER BY avg_engagement_rate DESC
        LIMIT 20
      `,
    );

    return rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      category: row.category || 'unknown',
      totalPosts: Number(row.total_posts ?? 0),
    }));
  }

  private async getBestPostingTimes(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<PostingTimeAnalysis[]> {
    const rows = await this.prisma.$queryRaw<PostingTimeAnalysisRow[]>(
      Prisma.sql`
        SELECT
          EXTRACT(HOUR FROM p."publicationDate")::int AS hour,
          AVG(pa."engagementRate") AS avg_engagement_rate,
          COUNT(DISTINCT pa."postId") AS post_count
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p."id" = pa."postId"
        WHERE ${this.buildAnalyticsSqlWhere(matchFilter)}
          AND p."isDeleted" = false
          AND p."publicationDate" IS NOT NULL
        GROUP BY hour
        ORDER BY avg_engagement_rate DESC
        LIMIT 24
      `,
    );

    return rows.map((row) => ({
      avgEngagementRate: Number(row.avg_engagement_rate ?? 0),
      hour: Number(row.hour),
      postCount: Number(row.post_count ?? 0),
    }));
  }

  private async getTopHooks(
    matchFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<string[]> {
    const topContent = await this.getContentByEngagement(
      matchFilter,
      5,
      'desc',
    );

    return topContent
      .map((item) => {
        const text = item.description || item.title || '';
        const firstLine = text.split(/[.\n]/)[0]?.trim();
        return firstLine || '';
      })
      .filter(Boolean);
  }

  private async getWeekOverWeekTrend(
    currentFilter: Prisma.PostAnalyticsWhereInput,
    previousFilter: Prisma.PostAnalyticsWhereInput,
  ): Promise<{
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  }> {
    const aggregateEngagement = async (
      filter: Prisma.PostAnalyticsWhereInput,
    ): Promise<number> => {
      const aggregate = await this.prisma.postAnalytics.aggregate({
        _sum: {
          totalComments: true,
          totalLikes: true,
          totalShares: true,
        },
        where: filter,
      });
      const sums = (aggregate as { _sum?: Record<string, unknown> })._sum ?? {};
      return (
        Number(sums.totalLikes ?? 0) +
        Number(sums.totalComments ?? 0) +
        Number(sums.totalShares ?? 0)
      );
    };

    const [currentEngagement, previousEngagement] = await Promise.all([
      aggregateEngagement(currentFilter),
      aggregateEngagement(previousFilter),
    ]);

    let percentageChange = 0;
    if (previousEngagement > 0) {
      percentageChange =
        ((currentEngagement - previousEngagement) / previousEngagement) * 100;
    } else if (currentEngagement > 0) {
      percentageChange = 100;
    }

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (percentageChange > 5) {
      direction = 'up';
    } else if (percentageChange < -5) {
      direction = 'down';
    }

    return {
      currentEngagement,
      direction,
      percentageChange,
      previousEngagement,
    };
  }
}
