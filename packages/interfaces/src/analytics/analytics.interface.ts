import { TrendDirection } from '@genfeedai/enums';

export interface IAnalytics {
  totalPosts: number;
  totalViews: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalSaves?: number;
  totalCredentialsConnected: number;
  avgEngagementRate?: number;
  totalEngagement?: number;
  monthlyGrowth: number;
  viewsGrowth: number;
  engagementGrowth?: number;
  activePlatforms?: string[];
  bestPerformingPlatform?: string;
  totalSubscriptions?: number;
  totalUsers?: number;
  totalBrands?: number;
  totalVideos?: number;
  totalImages?: number;

  // Admin dashboard stats
  totalOrganizations?: number;
  totalCredits?: number;
  activeWorkflows?: number;
  activeBots?: number;
  totalModels?: number;
  pendingPosts?: number;
  recentActivities?: number;
}

export interface IAnalyticsCSVRecord {
  video: string;
  views: number;
  comments: number;
  likes: number;
  platform: string;
}

export interface IPostAnalytics {
  id: string;
  post: string;
  platform: string;
  date: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number;
  totalViewsIncrement: number;
  totalLikesIncrement: number;
  totalCommentsIncrement: number;
  totalSharesIncrement: number;
}

export interface IPostAnalyticsSummary {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  platforms: Record<string, IPlatformStats>;
}

export interface IPlatformStats {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  engagementRate: number;
}

export interface IAnalyticsRefreshResponse {
  totalPosts: number;
  successCount: number;
  errorCount: number;
  lastRefreshed: string;
}

export interface IPostWithAnalytics {
  id: string;
  label: string;
  platform: string;
  status: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  engagementRate: number;
}

export interface IOrganizationAnalyticsTotals {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
}

export interface ITimeSeriesDataPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  totalEngagement: number;
}

export interface IPlatformComparison {
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

export interface IGrowthTrends {
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
  trendingDirection: TrendDirection;
}

export interface IEngagementBreakdown {
  likes: number;
  likesPercentage: number;
  comments: number;
  commentsPercentage: number;
  shares: number;
  sharesPercentage: number;
  saves: number;
  savesPercentage: number;
  total: number;
}

export interface ITopContent {
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
  publishDate: Date | string;
  url?: string;
}
