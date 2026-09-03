import type { TrendDirection } from '@genfeedai/contracts';
import type {
  IAnalytics,
  IAnalyticsCSVRecord,
  IAnalyticsRefreshResponse,
  IEngagementBreakdown,
  IGrowthTrends,
  IOrganizationAnalyticsTotals,
  IPlatformComparison,
  IPlatformStats,
  IPostAnalytics,
  IPostAnalyticsSummary,
  IPostWithAnalytics,
  ITimeSeriesDataPoint,
  ITopContent,
} from '@genfeedai/contracts/interfaces';

export class Analytics implements IAnalytics {
  declare public totalPosts: number;
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public totalShares: number;
  declare public totalSaves: number;
  declare public totalCredentialsConnected: number;
  declare public avgEngagementRate: number;
  declare public totalEngagement?: number;
  declare public monthlyGrowth: number;
  declare public viewsGrowth: number;
  declare public engagementGrowth?: number;
  declare public activePlatforms?: string[];
  declare public bestPerformingPlatform?: string;
  declare public totalSubscriptions?: number;
  declare public totalUsers?: number;
  declare public totalBrands?: number;

  constructor(data: Partial<IAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class AnalyticsCSVRecord implements IAnalyticsCSVRecord {
  declare public video: string;
  declare public views: number;
  declare public comments: number;
  declare public likes: number;
  declare public platform: string;

  constructor(data: Partial<IAnalyticsCSVRecord> = {}) {
    Object.assign(this, data);
  }
}

export class PostAnalytics implements IPostAnalytics {
  declare public id: string;
  declare public post: string;
  declare public platform: string;
  declare public date: string;
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public totalShares: number;
  declare public engagementRate: number;
  declare public totalViewsIncrement: number;
  declare public totalLikesIncrement: number;
  declare public totalCommentsIncrement: number;
  declare public totalSharesIncrement: number;

  constructor(data: Partial<IPostAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class PlatformStats implements IPlatformStats {
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public totalShares: number;
  declare public totalSaves: number;
  declare public engagementRate: number;

  constructor(data: Partial<IPlatformStats> = {}) {
    Object.assign(this, data);
  }
}

export class PostAnalyticsSummary implements IPostAnalyticsSummary {
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public totalShares: number;
  declare public totalSaves: number;
  declare public avgEngagementRate: number;
  declare public platforms: Record<string, IPlatformStats>;

  constructor(data: Partial<IPostAnalyticsSummary> = {}) {
    Object.assign(this, data);
  }
}

export class AnalyticsRefreshResponse implements IAnalyticsRefreshResponse {
  declare public totalPosts: number;
  declare public successCount: number;
  declare public errorCount: number;
  declare public lastRefreshed: string;

  constructor(data: Partial<IAnalyticsRefreshResponse> = {}) {
    Object.assign(this, data);
  }
}

export class PostWithAnalytics implements IPostWithAnalytics {
  declare public id: string;
  declare public label: string;
  declare public platform: string;
  declare public status: string;
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public engagementRate: number;

  constructor(data: Partial<IPostWithAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class OrganizationAnalyticsTotals
  implements IOrganizationAnalyticsTotals
{
  declare public totalPosts: number;
  declare public totalViews: number;
  declare public totalLikes: number;
  declare public totalComments: number;
  declare public totalShares: number;
  declare public avgEngagementRate: number;

  constructor(data: Partial<IOrganizationAnalyticsTotals> = {}) {
    Object.assign(this, data);
  }
}

export class TimeSeriesDataPoint implements ITimeSeriesDataPoint {
  declare public date: string;
  declare public views: number;
  declare public likes: number;
  declare public comments: number;
  declare public shares: number;
  declare public saves: number;
  declare public engagementRate: number;
  declare public totalEngagement: number;

  constructor(data: Partial<ITimeSeriesDataPoint> = {}) {
    Object.assign(this, data);
  }
}

export class PlatformComparison implements IPlatformComparison {
  declare public platform: string;
  declare public views: number;
  declare public likes: number;
  declare public comments: number;
  declare public shares: number;
  declare public saves: number;
  declare public engagementRate: number;
  declare public postCount: number;
  declare public avgViewsPerPost: number;

  constructor(data: Partial<IPlatformComparison> = {}) {
    Object.assign(this, data);
  }
}

export class GrowthTrends implements IGrowthTrends {
  declare public views: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  declare public engagement: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  declare public bestDay: {
    date: string;
    views: number;
  };
  declare public trendingDirection: TrendDirection;

  constructor(data: Partial<IGrowthTrends> = {}) {
    Object.assign(this, data);
  }
}

export class EngagementBreakdown implements IEngagementBreakdown {
  declare public likes: number;
  declare public likesPercentage: number;
  declare public comments: number;
  declare public commentsPercentage: number;
  declare public shares: number;
  declare public sharesPercentage: number;
  declare public saves: number;
  declare public savesPercentage: number;
  declare public total: number;

  constructor(data: Partial<IEngagementBreakdown> = {}) {
    Object.assign(this, data);
  }
}

export class TopContent implements ITopContent {
  declare public postId: string;
  declare public ingredientId: string;
  declare public title: string;
  declare public description: string;
  declare public platform: string;
  declare public views: number;
  declare public likes: number;
  declare public comments: number;
  declare public shares: number;
  declare public engagementRate: number;
  declare public publishDate: Date | string;
  declare public url?: string;

  constructor(data: Partial<ITopContent> = {}) {
    Object.assign(this, data);
  }
}
