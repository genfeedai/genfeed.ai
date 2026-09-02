import type {
  AnalyticsAggregateResult,
  AnalyticsDateRow,
  AnalyticsPlatformDateRow,
  EngagementBreakdown,
  GrowthTrends,
  OverviewMetrics,
  PlatformComparison,
  PlatformComparisonRow,
  PlatformMetrics,
  TimeSeriesDataPoint,
  TimeSeriesDataPointWithPlatforms,
  TopContent,
  TopContentAnalyticsRow,
  TopContentPostRow,
  TopContentScore,
  ViewsByDateRow,
} from '@api/collections/posts/services/analytics-aggregation.types';
import { AnalyticsMetric } from '@genfeedai/contracts';

type TimeSeriesGroup = 'day' | 'week';

interface OverviewProjectionInput {
  activePlatforms: string[];
  currentAggregate: AnalyticsAggregateResult;
  previousAggregate: AnalyticsAggregateResult;
  totalBrands: number;
  totalPosts: number;
}

interface PlatformOverviewProjectionInput
  extends Omit<OverviewProjectionInput, 'activePlatforms'> {
  platform: string;
}

/**
 * Pure projection owner for post analytics. It receives already-scoped query
 * results and never performs transport, persistence, or framework work.
 */
export class PostAnalyticsProjection {
  buildOverview(input: OverviewProjectionInput): OverviewMetrics {
    const current = this.readAggregateMetrics(input.currentAggregate);
    const previous = this.readAggregateMetrics(input.previousAggregate);

    return {
      activePlatforms: input.activePlatforms,
      avgEngagementRate: current.avgEngagementRate,
      bestPerformingPlatform: input.activePlatforms[0] ?? 'N/A',
      engagementGrowth:
        previous.totalEngagement > 0
          ? ((current.totalEngagement - previous.totalEngagement) /
              previous.totalEngagement) *
            100
          : 0,
      totalBrands: input.totalBrands,
      totalComments: current.totalComments,
      totalEngagement: current.totalEngagement,
      totalLikes: current.totalLikes,
      totalPosts: input.totalPosts,
      totalSaves: current.totalSaves,
      totalShares: current.totalShares,
      totalViews: current.totalViews,
      viewsGrowth:
        previous.totalViews > 0
          ? ((current.totalViews - previous.totalViews) / previous.totalViews) *
            100
          : 0,
    };
  }

  buildPlatformOverview(
    input: PlatformOverviewProjectionInput,
  ): OverviewMetrics {
    const current = this.readAggregateMetrics(input.currentAggregate);
    const previous = this.readAggregateMetrics(input.previousAggregate);

    return {
      activePlatforms: [input.platform],
      avgEngagementRate: current.avgEngagementRate,
      bestPerformingPlatform: input.platform,
      engagementGrowth: this.calculateGrowthPercentage(
        current.totalEngagement,
        previous.totalEngagement,
      ),
      totalBrands: input.totalBrands,
      totalComments: current.totalComments,
      totalEngagement: current.totalEngagement,
      totalLikes: current.totalLikes,
      totalPosts: input.totalPosts,
      totalSaves: current.totalSaves,
      totalShares: current.totalShares,
      totalViews: current.totalViews,
      viewsGrowth: this.calculateGrowthPercentage(
        current.totalViews,
        previous.totalViews,
      ),
    };
  }

  buildTimeSeries(
    rows: AnalyticsDateRow[],
    groupBy: TimeSeriesGroup,
  ): TimeSeriesDataPoint[] {
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

    for (const row of rows) {
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
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, data]) => ({
        comments: data.comments,
        date,
        engagementRate:
          data.rowCount > 0 ? data.engagementRate / data.rowCount : 0,
        likes: data.likes,
        saves: data.saves,
        shares: data.shares,
        totalEngagement: data.likes + data.comments + data.shares,
        views: data.views,
      }));
  }

  buildTimeSeriesWithPlatforms(
    rows: AnalyticsPlatformDateRow[],
    startDate: Date,
    endDate: Date,
    groupBy: TimeSeriesGroup,
  ): TimeSeriesDataPointWithPlatforms[] {
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();

    for (const row of rows) {
      const dateKey = this.readDateKey(row.date, groupBy);
      const sums = row._sum ?? {};
      const platformMap =
        dataMap.get(dateKey) ?? new Map<string, PlatformMetrics>();
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
      dataMap.set(dateKey, platformMap);
    }

    return this.generateDateScaffolding(startDate, endDate, groupBy).map(
      (date) => {
        const platformData =
          dataMap.get(date) ?? new Map<string, PlatformMetrics>();
        return {
          date,
          facebook:
            platformData.get('facebook') ?? this.createEmptyPlatformMetrics(),
          instagram:
            platformData.get('instagram') ?? this.createEmptyPlatformMetrics(),
          linkedin:
            platformData.get('linkedin') ?? this.createEmptyPlatformMetrics(),
          medium:
            platformData.get('medium') ?? this.createEmptyPlatformMetrics(),
          pinterest:
            platformData.get('pinterest') ?? this.createEmptyPlatformMetrics(),
          reddit:
            platformData.get('reddit') ?? this.createEmptyPlatformMetrics(),
          tiktok:
            platformData.get('tiktok') ?? this.createEmptyPlatformMetrics(),
          twitter:
            platformData.get('twitter') ?? this.createEmptyPlatformMetrics(),
          youtube:
            platformData.get('youtube') ?? this.createEmptyPlatformMetrics(),
        };
      },
    );
  }

  buildPlatformComparison(rows: PlatformComparisonRow[]): PlatformComparison[] {
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

  scoreTopContent(
    rows: TopContentAnalyticsRow[],
    metric: AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT,
    limit: number,
  ): TopContentScore[] {
    const scored = rows.map((row) => {
      const max = row._max ?? {};
      const likes = this.readNumber(max.totalLikes);
      const comments = this.readNumber(max.totalComments);
      const shares = this.readNumber(max.totalShares);
      return {
        avgEngagementRate: this.readNumber(row._avg?.engagementRate),
        comments,
        likes,
        platform: row.platform,
        postId: row.postId,
        shares,
        totalEngagement: likes + comments + shares,
        views: this.readNumber(max.totalViews),
      };
    });

    return (
      metric === AnalyticsMetric.ENGAGEMENT
        ? scored.sort(
            (left, right) => right.totalEngagement - left.totalEngagement,
          )
        : scored.sort((left, right) => right.views - left.views)
    ).slice(0, limit);
  }

  buildTopContent(
    scored: TopContentScore[],
    posts: TopContentPostRow[],
  ): TopContent[] {
    const postMap = new Map(posts.map((post) => [post.id, post]));

    return scored.map((item) => {
      const post = postMap.get(item.postId);
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

  buildGrowthTrends(
    currentAggregate: AnalyticsAggregateResult,
    previousAggregate: AnalyticsAggregateResult,
    viewsByDateRows: ViewsByDateRow[],
  ): GrowthTrends {
    const current = this.readAggregateMetrics(currentAggregate);
    const previous = this.readAggregateMetrics(previousAggregate);
    const bestDay = viewsByDateRows[0];
    const viewsGrowth = current.totalViews - previous.totalViews;
    const engagementGrowth = current.totalEngagement - previous.totalEngagement;
    const viewsGrowthPercentage =
      previous.totalViews > 0 ? (viewsGrowth / previous.totalViews) * 100 : 0;
    let trendingDirection: GrowthTrends['trendingDirection'] = 'stable';
    if (viewsGrowthPercentage > 5) {
      trendingDirection = 'up';
    } else if (viewsGrowthPercentage < -5) {
      trendingDirection = 'down';
    }

    return {
      bestDay: {
        date: bestDay ? this.readDateKey(bestDay.date, 'day') : 'N/A',
        views: this.readNumber(bestDay?._sum?.totalViews),
      },
      engagement: {
        current: current.totalEngagement,
        growth: engagementGrowth,
        growthPercentage:
          previous.totalEngagement > 0
            ? (engagementGrowth / previous.totalEngagement) * 100
            : 0,
        previous: previous.totalEngagement,
      },
      trendingDirection,
      views: {
        current: current.totalViews,
        growth: viewsGrowth,
        growthPercentage: viewsGrowthPercentage,
        previous: previous.totalViews,
      },
    };
  }

  buildEngagementBreakdown(
    aggregate: AnalyticsAggregateResult,
  ): EngagementBreakdown {
    const sums = aggregate._sum ?? {};
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

  private readAggregateMetrics(aggregate: AnalyticsAggregateResult): {
    avgEngagementRate: number;
    totalComments: number;
    totalEngagement: number;
    totalLikes: number;
    totalSaves: number;
    totalShares: number;
    totalViews: number;
  } {
    const sums = aggregate._sum ?? {};
    const totalLikes = this.readNumber(sums.totalLikes);
    const totalComments = this.readNumber(sums.totalComments);
    const totalShares = this.readNumber(sums.totalShares);
    return {
      avgEngagementRate: this.readNumber(aggregate._avg?.engagementRate),
      totalComments,
      totalEngagement: totalLikes + totalComments + totalShares,
      totalLikes,
      totalSaves: this.readNumber(sums.totalSaves),
      totalShares,
      totalViews: this.readNumber(sums.totalViews),
    };
  }

  private calculateGrowthPercentage(current: number, previous: number): number {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    }
    return current > 0 ? 100 : 0;
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

  private generateDateScaffolding(
    startDate: Date,
    endDate: Date,
    groupBy: TimeSeriesGroup,
  ): string[] {
    // Step one calendar day at a time and de-duplicate: a seven-day step can
    // skip a week key across a year boundary, dropping real rows from the series.
    const dates: string[] = [];
    const seen = new Set<string>();
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);

    while (current <= endDate) {
      const key = this.readDateKey(current, groupBy);
      if (!seen.has(key)) {
        seen.add(key);
        dates.push(key);
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private readDateKey(date: Date, groupBy: TimeSeriesGroup): string {
    if (groupBy === 'day') {
      return new Date(date).toISOString().split('T')[0];
    }

    const current = new Date(date);
    const year = current.getUTCFullYear();
    const oneJan = new Date(Date.UTC(year, 0, 1));
    const days = Math.floor(
      (current.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
    );
    const week = Math.ceil((days + oneJan.getUTCDay() + 1) / 7);
    return `${year}-${String(week).padStart(2, '0')}`;
  }

  private readNumber(value: unknown): number {
    return Number(value ?? 0);
  }
}
