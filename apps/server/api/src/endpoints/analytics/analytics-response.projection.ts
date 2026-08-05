import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/enums';

export type RawAnalyticsRow = Record<string, unknown>;

interface PlatformMetrics {
  comments: number;
  engagementRate: number;
  likes: number;
  saves: number;
  shares: number;
  views: number;
}

interface PlatformTotals {
  engagement: number;
  posts: number;
  views: number;
}

export type AnalyticsBestPostingTime = {
  avgEngagementRate: number;
  hour: number;
  platform: string;
  postCount: number;
};

type ViralHookVideo = {
  description: string;
  hook: string;
  id: string;
  platforms: string[];
  title: string;
  totalEngagement: number;
  totalViews: number;
};

type HookEffectiveness = {
  avgEngagement: number;
  avgViews: number;
  hook: string;
  postCount: number;
};

type TopPlatformSummary = {
  platform: string;
  postCount: number;
  totalEngagement: number;
  totalViews: number;
};

export type ViralHooksResult = {
  analysis: {
    hookEffectiveness: HookEffectiveness[];
    topHooks: Array<{ hook: string; avgEngagement: number; postCount: number }>;
    topPlatforms: TopPlatformSummary[];
    totalVideos: number;
  };
  videos: ViralHookVideo[];
};

/**
 * Pure response owner for endpoint analytics. Inputs are already-scoped query
 * rows; this class performs no transport, persistence, logging, or DI work.
 */
export class AnalyticsResponseProjection {
  buildTimeSeries(
    rawResults: RawAnalyticsRow[],
    startDate: Date,
    endDate: Date,
  ): Array<Record<string, unknown>> {
    const dataMap = new Map<string, Map<string, PlatformMetrics>>();
    for (const row of rawResults) {
      const day = row.day as string;
      const platform = row.platform as string;
      const platformMap =
        dataMap.get(day) ?? new Map<string, PlatformMetrics>();
      platformMap.set(platform, {
        comments: Number(row.comments),
        engagementRate: Number(row.engagement_rate) || 0,
        likes: Number(row.likes),
        saves: Number(row.saves),
        shares: Number(row.shares),
        views: Number(row.views),
      });
      dataMap.set(day, platformMap);
    }

    return this.generateDateScaffolding(startDate, endDate).map((date) =>
      this.buildTimeSeriesRow(
        date,
        dataMap.get(date) || new Map<string, PlatformMetrics>(),
      ),
    );
  }

  buildOverview(
    current: RawAnalyticsRow,
    previous: RawAnalyticsRow,
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

  buildBestPostingTimes(rows: RawAnalyticsRow[]): AnalyticsBestPostingTime[] {
    return rows.map((row) => ({
      avgEngagementRate: Number(
        (Number(row.avg_engagement_rate) || 0).toFixed(2),
      ),
      hour: Number(row.hour),
      platform: row.platform as string,
      postCount: Number(row.post_count),
    }));
  }

  buildTopContent(rows: RawAnalyticsRow[]): Array<Record<string, unknown>> {
    return rows.map((row) => ({
      id: row.id as string,
      brandLogo: row.brand_logo as unknown,
      brandName: row.brand_name as string,
      date: row.date as Date,
      description: row.description as string,
      engagementRate: Number(row.engagement_rate),
      ingredientUrl: undefined,
      isVideo: false,
      label: row.label as string,
      platform: row.platform as string,
      postId: row.post_id as string,
      thumbnailUrl: undefined,
      totalComments: Number(row.total_comments),
      totalEngagement: Number(row.total_engagement),
      totalLikes: Number(row.total_likes),
      totalSaves: Number(row.total_saves),
      totalShares: Number(row.total_shares),
      totalViews: Number(row.total_views),
    }));
  }

  buildPlatformComparison(
    rows: RawAnalyticsRow[],
  ): Array<Record<string, unknown>> {
    const totals = rows.reduce<PlatformTotals>(
      (acc, platform) => {
        acc.views += Number(platform.total_views);
        acc.engagement += Number(platform.total_engagement);
        acc.posts += Number(platform.total_posts);
        return acc;
      },
      { engagement: 0, posts: 0, views: 0 },
    );

    return rows.map((platform) => {
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

  buildGrowthTrends(
    currentResults: RawAnalyticsRow[],
    previous: RawAnalyticsRow,
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

  buildEngagementBreakdown(data?: RawAnalyticsRow): Record<string, unknown> {
    const row = data || {
      total_comments: 0,
      total_likes: 0,
      total_saves: 0,
      total_shares: 0,
    };
    const totalComments = Number(row.total_comments);
    const totalLikes = Number(row.total_likes);
    const totalSaves = Number(row.total_saves);
    const totalShares = Number(row.total_shares);
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

  buildViralHooks(
    videos: RawAnalyticsRow[],
    topPlatformsRaw: RawAnalyticsRow[],
  ): ViralHooksResult {
    const videosWithHooks: ViralHookVideo[] = videos.map((video) => ({
      description: (video.description as string) || '',
      hook: this.extractHookFromDescription(video.description as string),
      id: video.id as string,
      platforms: (video.platforms as string[]) || [],
      title: (video.title as string) || 'Untitled',
      totalEngagement: Number(video.total_engagement),
      totalViews: Number(video.total_views),
    }));
    const hookEffectiveness = this.buildHookEffectiveness(videosWithHooks);
    const topHooks = hookEffectiveness.slice(0, 10).map((hook) => ({
      avgEngagement: hook.avgEngagement,
      hook: hook.hook,
      postCount: hook.postCount,
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

  private buildHookEffectiveness(
    videosWithHooks: ViralHookVideo[],
  ): HookEffectiveness[] {
    const hookMap = new Map<
      string,
      { totalEngagement: number; totalViews: number; count: number }
    >();

    for (const video of videosWithHooks) {
      if (!video.hook) {
        continue;
      }
      const normalized = video.hook.toLowerCase().trim();
      const existing = hookMap.get(normalized) || {
        count: 0,
        totalEngagement: 0,
        totalViews: 0,
      };
      existing.totalEngagement += video.totalEngagement;
      existing.totalViews += video.totalViews;
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
      .sort((left, right) => right.avgEngagement - left.avgEngagement);
  }

  private mapTopPlatforms(rows: RawAnalyticsRow[]): TopPlatformSummary[] {
    return rows.map((platform) => ({
      platform: platform.platform as string,
      postCount: Number(platform.post_count),
      totalEngagement: Number(platform.total_engagement),
      totalViews: Number(platform.total_views),
    }));
  }

  private extractHookFromDescription(description?: string): string {
    if (!description || description.trim().length === 0) {
      return '';
    }

    const trimmed = description.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    if (firstLine.length <= 150) {
      return firstLine;
    }

    const sentenceMatch = firstLine.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch) {
      return sentenceMatch[0].trim();
    }

    return firstLine.substring(0, 150);
  }
}
