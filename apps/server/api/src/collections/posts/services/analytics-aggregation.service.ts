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
import { Injectable } from '@nestjs/common';

export interface Timeframe {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

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

@Injectable()
export class AnalyticsAggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {}

  /**
   * Parse date range with validation
   */
  private parseDateRange(
    startDateInput?: Date | string,
    endDateInput?: Date | string,
  ): Timeframe {
    return DateRangeUtil.parseDateRange(startDateInput, endDateInput);
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
    } = this.parseDateRange(startDate, endDate);

    const where: Record<string, unknown> = {
      date: { gte: parsedStartDate, lte: parsedEndDate },
      organizationId,
    };

    if (brandId) {
      where.brandId = brandId;
    }

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const docTyped = docs as unknown as Array<{
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Aggregate in-memory
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalSaves = 0;
    let totalShares = 0;
    let engagementRateSum = 0;
    const platformSet = new Set<string>();
    const platformViews = new Map<string, number>();

    for (const doc of docTyped) {
      totalViews += doc.totalViews;
      totalLikes += doc.totalLikes;
      totalComments += doc.totalComments;
      totalSaves += doc.totalSaves;
      totalShares += doc.totalShares;
      engagementRateSum += doc.engagementRate;
      platformSet.add(doc.platform);
      platformViews.set(
        doc.platform,
        (platformViews.get(doc.platform) || 0) + doc.totalViews,
      );
    }

    // Previous period
    const prevWhere: Record<string, unknown> = {
      date: { gte: previousStartDate, lte: previousEndDate },
      organizationId,
    };
    if (brandId) prevWhere.brandId = brandId;

    const prevDocs = await this.prisma.postAnalytics.findMany({
      where: prevWhere as never,
    });

    const prevTyped = prevDocs as unknown as Array<{
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
    }>;

    let prevViews = 0;
    let prevEngagement = 0;
    for (const doc of prevTyped) {
      prevViews += doc.totalViews;
      prevEngagement += doc.totalLikes + doc.totalComments + doc.totalShares;
    }

    const postCount = await this.postsService.count({
      isDeleted: false,
      organizationId,
      ...(brandId ? { brandId } : {}),
    });

    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate =
      docTyped.length > 0 ? engagementRateSum / docTyped.length : 0;

    const viewsGrowth =
      prevViews > 0 ? ((totalViews - prevViews) / prevViews) * 100 : 0;
    const engagementGrowth =
      prevEngagement > 0
        ? ((totalEngagement - prevEngagement) / prevEngagement) * 100
        : 0;

    // Best performing platform
    let bestPlatform = 'N/A';
    let maxViews = 0;
    for (const [platform, views] of platformViews.entries()) {
      if (views > maxViews) {
        maxViews = views;
        bestPlatform = platform;
      }
    }

    return {
      activePlatforms: Array.from(platformSet),
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

    const docs = await this.prisma.postAnalytics.findMany({
      orderBy: { date: 'asc' },
      where: where as never,
    });

    const docTyped = docs as unknown as Array<{
      date: Date;
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group by date
    const grouped = new Map<
      string,
      {
        comments: number;
        engagementRates: number[];
        likes: number;
        saves: number;
        shares: number;
        views: number;
      }
    >();

    for (const doc of docTyped) {
      let dateKey: string;
      if (groupBy === 'week') {
        const d = new Date(doc.date);
        const year = d.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const days = Math.floor(
          (d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
        dateKey = `${year}-${String(week).padStart(2, '0')}`;
      } else {
        dateKey = new Date(doc.date).toISOString().split('T')[0];
      }

      const existing = grouped.get(dateKey);
      if (existing) {
        existing.views += doc.totalViews;
        existing.likes += doc.totalLikes;
        existing.comments += doc.totalComments;
        existing.shares += doc.totalShares;
        existing.saves += doc.totalSaves;
        existing.engagementRates.push(doc.engagementRate);
      } else {
        grouped.set(dateKey, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => {
        const engagementRate =
          data.engagementRates.length > 0
            ? data.engagementRates.reduce((a, b) => a + b, 0) /
              data.engagementRates.length
            : 0;
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
    const { startDate, endDate } = this.parseDateRange(
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

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const docTyped = docs as unknown as Array<{
      date: Date;
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group by date+platform in-memory
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();

    for (const doc of docTyped) {
      let dateKey: string;
      if (groupBy === 'week') {
        const d = new Date(doc.date);
        const year = d.getFullYear();
        const oneJan = new Date(year, 0, 1);
        const days = Math.floor(
          (d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
        dateKey = `${year}-${String(week).padStart(2, '0')}`;
      } else {
        dateKey = new Date(doc.date).toISOString().split('T')[0];
      }

      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, new Map());
      }

      const platformMap = dataMap.get(dateKey)!;
      const existing = platformMap.get(doc.platform);
      if (existing) {
        existing.views += doc.totalViews;
        existing.likes += doc.totalLikes;
        existing.comments += doc.totalComments;
        existing.shares += doc.totalShares;
        existing.saves += doc.totalSaves;
        existing.engagementRate =
          (existing.engagementRate + doc.engagementRate) / 2;
      } else {
        platformMap.set(doc.platform, {
          comments: doc.totalComments,
          engagementRate: doc.engagementRate,
          likes: doc.totalLikes,
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
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
    const { startDate, endDate } = this.parseDateRange(
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

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const docTyped = docs as unknown as Array<{
      platform: string;
      postId: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group by platform in-memory
    const platformMap = new Map<
      string,
      {
        comments: number;
        engagementRates: number[];
        likes: number;
        postIds: Set<string>;
        saves: number;
        shares: number;
        views: number;
      }
    >();

    for (const doc of docTyped) {
      const existing = platformMap.get(doc.platform);
      if (existing) {
        existing.views += doc.totalViews;
        existing.likes += doc.totalLikes;
        existing.comments += doc.totalComments;
        existing.shares += doc.totalShares;
        existing.saves += doc.totalSaves;
        existing.engagementRates.push(doc.engagementRate);
        existing.postIds.add(doc.postId);
      } else {
        platformMap.set(doc.platform, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          postIds: new Set([doc.postId]),
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    return Array.from(platformMap.entries())
      .map(([platform, data]) => {
        const postCount = data.postIds.size;
        const avgEngagementRate =
          data.engagementRates.length > 0
            ? data.engagementRates.reduce((a, b) => a + b, 0) /
              data.engagementRates.length
            : 0;

        return {
          avgViewsPerPost: postCount > 0 ? data.views / postCount : 0,
          comments: data.comments,
          engagementRate: avgEngagementRate,
          likes: data.likes,
          platform,
          postCount,
          saves: data.saves,
          shares: data.shares,
          views: data.views,
        };
      })
      .sort((a, b) => b.views - a.views);
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
    const { startDate, endDate } = this.parseDateRange(
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

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const docTyped = docs as unknown as Array<{
      postId: string;
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group by postId in-memory
    const postMap = new Map<
      string,
      {
        comments: number;
        engagementRates: number[];
        likes: number;
        platform: string;
        shares: number;
        views: number;
      }
    >();

    for (const doc of docTyped) {
      const existing = postMap.get(doc.postId);
      if (existing) {
        existing.views = Math.max(existing.views, doc.totalViews);
        existing.likes = Math.max(existing.likes, doc.totalLikes);
        existing.comments = Math.max(existing.comments, doc.totalComments);
        existing.shares = Math.max(existing.shares, doc.totalShares);
        existing.engagementRates.push(doc.engagementRate);
      } else {
        postMap.set(doc.postId, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          platform: doc.platform,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    const scored = Array.from(postMap.entries()).map(([postId, data]) => {
      const avgEngagementRate =
        data.engagementRates.length > 0
          ? data.engagementRates.reduce((a, b) => a + b, 0) /
            data.engagementRates.length
          : 0;
      const totalEngagement = data.likes + data.comments + data.shares;

      return {
        avgEngagementRate,
        comments: data.comments,
        likes: data.likes,
        platform: data.platform,
        postId,
        shares: data.shares,
        totalEngagement,
        views: data.views,
      };
    });

    // Sort by metric
    const sorted =
      metric === AnalyticsMetric.ENGAGEMENT
        ? scored.sort((a, b) => b.totalEngagement - a.totalEngagement)
        : scored.sort((a, b) => b.views - a.views);

    const topScored = sorted.slice(0, limit);

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
      this.parseDateRange(startDateInput, endDateInput);

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

    const [docs, prevDocs] = await Promise.all([
      this.prisma.postAnalytics.findMany({ where: where as never }),
      this.prisma.postAnalytics.findMany({ where: prevWhere as never }),
    ]);

    const typed = docs as unknown as Array<{
      date: Date;
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
    }>;
    const prevTyped = prevDocs as unknown as Array<{
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
    }>;

    let totalViews = 0;
    let totalEngagement = 0;
    const viewsByDate = new Map<string, number>();

    for (const doc of typed) {
      totalViews += doc.totalViews;
      totalEngagement += doc.totalLikes + doc.totalComments + doc.totalShares;

      const dateKey = new Date(doc.date).toISOString().split('T')[0];
      viewsByDate.set(
        dateKey,
        (viewsByDate.get(dateKey) || 0) + doc.totalViews,
      );
    }

    let prevViews = 0;
    let prevEngagement = 0;
    for (const doc of prevTyped) {
      prevViews += doc.totalViews;
      prevEngagement += doc.totalLikes + doc.totalComments + doc.totalShares;
    }

    // Best day
    let bestDate = 'N/A';
    let bestViews = 0;
    for (const [date, views] of viewsByDate.entries()) {
      if (views > bestViews) {
        bestViews = views;
        bestDate = date;
      }
    }

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
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) where.brandId = brandId;

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const typed = docs as unknown as Array<{
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
    }>;

    let likes = 0;
    let comments = 0;
    let shares = 0;
    let saves = 0;

    for (const doc of typed) {
      likes += doc.totalLikes;
      comments += doc.totalComments;
      shares += doc.totalShares;
      saves += doc.totalSaves;
    }

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
    const { startDate, endDate } = this.parseDateRange(
      startDateInput,
      endDateInput,
    );

    const where: Record<string, unknown> = {
      date: { gte: startDate, lte: endDate },
      organizationId,
    };

    if (brandId) where.brandId = brandId;

    const docs = await this.prisma.postAnalytics.findMany({
      where: where as never,
    });

    const typed = docs as unknown as Array<{
      postId: string;
      platform: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    // Group by postId then platform in-memory
    const postPlatformMap = new Map<
      string,
      Map<
        string,
        {
          comments: number;
          engagementRates: number[];
          likes: number;
          saves: number;
          shares: number;
          views: number;
        }
      >
    >();

    for (const doc of typed) {
      if (!postPlatformMap.has(doc.postId)) {
        postPlatformMap.set(doc.postId, new Map());
      }

      const platformMap = postPlatformMap.get(doc.postId)!;
      const existing = platformMap.get(doc.platform);

      if (existing) {
        existing.views = Math.max(existing.views, doc.totalViews);
        existing.likes = Math.max(existing.likes, doc.totalLikes);
        existing.comments = Math.max(existing.comments, doc.totalComments);
        existing.shares = Math.max(existing.shares, doc.totalShares);
        existing.saves = Math.max(existing.saves, doc.totalSaves);
        existing.engagementRates.push(doc.engagementRate);
      } else {
        platformMap.set(doc.platform, {
          comments: doc.totalComments,
          engagementRates: [doc.engagementRate],
          likes: doc.totalLikes,
          saves: doc.totalSaves,
          shares: doc.totalShares,
          views: doc.totalViews,
        });
      }
    }

    // Sort posts by total views, take top 25
    const ranked = Array.from(postPlatformMap.entries())
      .map(([postId, platforms]) => {
        const totalViews = Array.from(platforms.values()).reduce(
          (sum, p) => sum + p.views,
          0,
        );
        return { platforms, postId, totalViews };
      })
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 25);

    // Fetch post details
    const postIds = ranked.map((r) => r.postId);
    const posts = await this.prisma.post.findMany({
      select: {
        createdAt: true,
        description: true,
        id: true,
        label: true,
        publicationDate: true,
        url: true,
      },
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
          const avgEngagementRate =
            data.engagementRates.length > 0
              ? data.engagementRates.reduce((a, b) => a + b, 0) /
                data.engagementRates.length
              : 0;
          const viralScore = Math.min(
            100,
            Math.round(avgEngagementRate * 5 + data.views / 1000),
          );

          return {
            avgWatchTime: 0,
            comments: data.comments,
            completionRate: 0,
            engagementRate: avgEngagementRate,
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
    } = this.parseDateRange(startDate, endDate);

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

    const [docs, prevDocs] = await Promise.all([
      this.prisma.postAnalytics.findMany({ where: where as never }),
      this.prisma.postAnalytics.findMany({ where: prevWhere as never }),
    ]);

    const typed = docs as unknown as Array<{
      postId: string;
      engagementRate: number;
      totalComments: number;
      totalLikes: number;
      totalSaves: number;
      totalShares: number;
      totalViews: number;
    }>;

    const prevTyped = prevDocs as unknown as Array<{
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
    }>;

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalSaves = 0;
    let totalShares = 0;
    let engRateSum = 0;
    const postIds = new Set<string>();

    for (const doc of typed) {
      totalViews += doc.totalViews;
      totalLikes += doc.totalLikes;
      totalComments += doc.totalComments;
      totalSaves += doc.totalSaves;
      totalShares += doc.totalShares;
      engRateSum += doc.engagementRate;
      postIds.add(doc.postId);
    }

    let prevViews = 0;
    let prevEngagement = 0;
    for (const doc of prevTyped) {
      prevViews += doc.totalViews;
      prevEngagement += doc.totalLikes + doc.totalComments + doc.totalShares;
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate = typed.length > 0 ? engRateSum / typed.length : 0;

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
      totalPosts: postIds.size,
      totalSaves,
      totalShares,
      totalViews,
      viewsGrowth: this.calculateGrowthPercentage(totalViews, prevViews),
    };
  }
}
