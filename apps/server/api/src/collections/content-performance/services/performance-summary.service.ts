import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
  ): Record<string, unknown> {
    return {
      brandId,
      date: { gte: startDate, lte: endDate },
      isDeleted: false,
      organizationId,
    };
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
      where: matchFilter as Parameters<
        typeof this.prisma.postAnalytics.findMany
      >[0]['where'],
      orderBy: { engagementRate: 'desc' },
      take: 50,
    });

    // Group by first 100 chars of description/label
    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({ where: { id: { in: postIds } } })
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
    matchFilter: Record<string, unknown>,
    limit: number,
    sortDirection: 'asc' | 'desc',
  ): Promise<PerformanceContentItem[]> {
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter as Parameters<
        typeof this.prisma.postAnalytics.findMany
      >[0]['where'],
      orderBy: { engagementRate: sortDirection },
      take: limit,
    });

    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({ where: { id: { in: postIds } } })
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
    matchFilter: Record<string, unknown>,
  ): Promise<PlatformEngagement[]> {
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter as Parameters<
        typeof this.prisma.postAnalytics.findMany
      >[0]['where'],
    });

    const platformMap = new Map<
      string,
      { totalEngagement: number; postIds: Set<string> }
    >();

    for (const item of analytics) {
      const platform = String(item.platform || 'unknown');
      const existing = platformMap.get(platform) ?? {
        postIds: new Set<string>(),
        totalEngagement: 0,
      };
      existing.totalEngagement += Number(item.engagementRate || 0);
      existing.postIds.add(String(item.postId));
      platformMap.set(platform, existing);
    }

    return Array.from(platformMap.entries())
      .map(([platform, data]) => ({
        avgEngagementRate:
          data.postIds.size > 0 ? data.totalEngagement / data.postIds.size : 0,
        platform,
        totalPosts: data.postIds.size,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }

  private async getAvgEngagementByContentType(
    matchFilter: Record<string, unknown>,
  ): Promise<ContentTypeEngagement[]> {
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter as Parameters<
        typeof this.prisma.postAnalytics.findMany
      >[0]['where'],
    });

    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({ where: { id: { in: postIds } } })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const categoryMap = new Map<
      string,
      { totalEngagement: number; postIds: Set<string> }
    >();

    for (const item of analytics) {
      const post = postMap.get(String(item.postId));
      const category = String(post?.category || 'unknown');
      const existing = categoryMap.get(category) ?? {
        postIds: new Set<string>(),
        totalEngagement: 0,
      };
      existing.totalEngagement += Number(item.engagementRate || 0);
      existing.postIds.add(String(item.postId));
      categoryMap.set(category, existing);
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        avgEngagementRate:
          data.postIds.size > 0 ? data.totalEngagement / data.postIds.size : 0,
        category,
        totalPosts: data.postIds.size,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }

  private async getBestPostingTimes(
    matchFilter: Record<string, unknown>,
  ): Promise<PostingTimeAnalysis[]> {
    const analytics = await this.prisma.postAnalytics.findMany({
      where: matchFilter as Parameters<
        typeof this.prisma.postAnalytics.findMany
      >[0]['where'],
    });

    const postIds = [...new Set(analytics.map((a) => String(a.postId)))];
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({ where: { id: { in: postIds } } })
        : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    const hourMap = new Map<
      number,
      { totalEngagement: number; count: number }
    >();

    for (const item of analytics) {
      const post = postMap.get(String(item.postId));
      const pubDate = post?.publicationDate;
      if (!pubDate) continue;

      const hour = new Date(pubDate).getHours();
      const existing = hourMap.get(hour) ?? { count: 0, totalEngagement: 0 };
      existing.totalEngagement += Number(item.engagementRate || 0);
      existing.count += 1;
      hourMap.set(hour, existing);
    }

    return Array.from(hourMap.entries())
      .map(([hour, data]) => ({
        avgEngagementRate:
          data.count > 0 ? data.totalEngagement / data.count : 0,
        hour,
        postCount: data.count,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }

  private async getTopHooks(
    matchFilter: Record<string, unknown>,
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
    currentFilter: Record<string, unknown>,
    previousFilter: Record<string, unknown>,
  ): Promise<{
    direction: 'up' | 'down' | 'stable';
    percentageChange: number;
    currentEngagement: number;
    previousEngagement: number;
  }> {
    const aggregateEngagement = async (
      filter: Record<string, unknown>,
    ): Promise<number> => {
      const rows = await this.prisma.postAnalytics.findMany({
        where: filter as Parameters<
          typeof this.prisma.postAnalytics.findMany
        >[0]['where'],
      });
      return rows.reduce(
        (sum, r) =>
          sum +
          (Number(r.totalLikes || 0) +
            Number(r.totalComments || 0) +
            Number(r.totalShares || 0)),
        0,
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
