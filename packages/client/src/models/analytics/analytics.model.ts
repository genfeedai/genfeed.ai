import type { TrendDirection } from '@genfeedai/enums';
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
} from '@genfeedai/interfaces';

export class Analytics implements IAnalytics {
  public declare totalPosts: number;
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare totalShares: number;
  public declare totalSaves: number;
  public declare totalCredentialsConnected: number;
  public declare avgEngagementRate: number;
  public declare totalEngagement?: number;
  public declare monthlyGrowth: number;
  public declare viewsGrowth: number;
  public declare engagementGrowth?: number;
  public declare activePlatforms?: string[];
  public declare bestPerformingPlatform?: string;
  public declare totalSubscriptions?: number;
  public declare totalUsers?: number;
  public declare totalBrands?: number;

  constructor(data: Partial<IAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class AnalyticsCSVRecord implements IAnalyticsCSVRecord {
  public declare video: string;
  public declare views: number;
  public declare comments: number;
  public declare likes: number;
  public declare platform: string;

  constructor(data: Partial<IAnalyticsCSVRecord> = {}) {
    Object.assign(this, data);
  }
}

export class PostAnalytics implements IPostAnalytics {
  public declare id: string;
  public declare post: string;
  public declare platform: string;
  public declare date: string;
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare totalShares: number;
  public declare engagementRate: number;
  public declare totalViewsIncrement: number;
  public declare totalLikesIncrement: number;
  public declare totalCommentsIncrement: number;
  public declare totalSharesIncrement: number;

  constructor(data: Partial<IPostAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class PlatformStats implements IPlatformStats {
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare totalShares: number;
  public declare totalSaves: number;
  public declare engagementRate: number;

  constructor(data: Partial<IPlatformStats> = {}) {
    Object.assign(this, data);
  }
}

export class PostAnalyticsSummary implements IPostAnalyticsSummary {
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare totalShares: number;
  public declare totalSaves: number;
  public declare avgEngagementRate: number;
  public declare platforms: Record<string, IPlatformStats>;

  constructor(data: Partial<IPostAnalyticsSummary> = {}) {
    Object.assign(this, data);
  }
}

export class AnalyticsRefreshResponse implements IAnalyticsRefreshResponse {
  public declare totalPosts: number;
  public declare successCount: number;
  public declare errorCount: number;
  public declare lastRefreshed: string;

  constructor(data: Partial<IAnalyticsRefreshResponse> = {}) {
    Object.assign(this, data);
  }
}

export class PostWithAnalytics implements IPostWithAnalytics {
  public declare id: string;
  public declare label: string;
  public declare platform: string;
  public declare status: string;
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare engagementRate: number;

  constructor(data: Partial<IPostWithAnalytics> = {}) {
    Object.assign(this, data);
  }
}

export class OrganizationAnalyticsTotals
  implements IOrganizationAnalyticsTotals
{
  public declare totalPosts: number;
  public declare totalViews: number;
  public declare totalLikes: number;
  public declare totalComments: number;
  public declare totalShares: number;
  public declare avgEngagementRate: number;

  constructor(data: Partial<IOrganizationAnalyticsTotals> = {}) {
    Object.assign(this, data);
  }
}

export class TimeSeriesDataPoint implements ITimeSeriesDataPoint {
  public declare date: string;
  public declare views: number;
  public declare likes: number;
  public declare comments: number;
  public declare shares: number;
  public declare saves: number;
  public declare engagementRate: number;
  public declare totalEngagement: number;

  constructor(data: Partial<ITimeSeriesDataPoint> = {}) {
    Object.assign(this, data);
  }
}

export class PlatformComparison implements IPlatformComparison {
  public declare platform: string;
  public declare views: number;
  public declare likes: number;
  public declare comments: number;
  public declare shares: number;
  public declare saves: number;
  public declare engagementRate: number;
  public declare postCount: number;
  public declare avgViewsPerPost: number;

  constructor(data: Partial<IPlatformComparison> = {}) {
    Object.assign(this, data);
  }
}

export class GrowthTrends implements IGrowthTrends {
  public declare views: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  public declare engagement: {
    current: number;
    previous: number;
    growth: number;
    growthPercentage: number;
  };
  public declare bestDay: {
    date: string;
    views: number;
  };
  public declare trendingDirection: TrendDirection;

  constructor(data: Partial<IGrowthTrends> = {}) {
    Object.assign(this, data);
  }
}

export class EngagementBreakdown implements IEngagementBreakdown {
  public declare likes: number;
  public declare likesPercentage: number;
  public declare comments: number;
  public declare commentsPercentage: number;
  public declare shares: number;
  public declare sharesPercentage: number;
  public declare saves: number;
  public declare savesPercentage: number;
  public declare total: number;

  constructor(data: Partial<IEngagementBreakdown> = {}) {
    Object.assign(this, data);
  }
}

export class TopContent implements ITopContent {
  public declare postId: string;
  public declare ingredientId: string;
  public declare title: string;
  public declare description: string;
  public declare platform: string;
  public declare views: number;
  public declare likes: number;
  public declare comments: number;
  public declare shares: number;
  public declare engagementRate: number;
  public declare publishDate: Date | string;
  public declare url?: string;

  constructor(data: Partial<ITopContent> = {}) {
    Object.assign(this, data);
  }
}
