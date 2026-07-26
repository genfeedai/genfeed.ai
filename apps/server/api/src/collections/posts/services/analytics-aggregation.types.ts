export interface OverviewMetrics {
  totalPosts: number;
  totalBrands: number;
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

export type NumericSqlValue = bigint | number | string | null;

export type DistinctPostCountRow = {
  post_count: NumericSqlValue;
};

export type PlatformComparisonRow = {
  comments: NumericSqlValue;
  engagement_rate: NumericSqlValue;
  likes: NumericSqlValue;
  platform: string | null;
  post_count: NumericSqlValue;
  saves: NumericSqlValue;
  shares: NumericSqlValue;
  views: NumericSqlValue;
};

export type PostViewsRow = {
  post_id: string;
  total_views: NumericSqlValue;
};

export interface AnalyticsAggregateResult {
  _avg?: { engagementRate?: unknown };
  _sum?: Record<string, unknown>;
}

export interface AnalyticsDateRow {
  _avg?: { engagementRate?: unknown };
  _sum?: Record<string, unknown>;
  date: Date;
}

export interface AnalyticsPlatformDateRow extends AnalyticsDateRow {
  platform: string;
}

export interface TopContentAnalyticsRow {
  _avg?: { engagementRate?: unknown };
  _max?: Record<string, unknown>;
  platform: string;
  postId: string;
}

export interface TopContentPostRow {
  description?: string;
  id: string;
  label?: string;
  publicationDate?: Date;
  url?: string;
}

export interface TopContentScore {
  avgEngagementRate: number;
  comments: number;
  likes: number;
  platform: string;
  postId: string;
  shares: number;
  totalEngagement: number;
  views: number;
}

export interface ViewsByDateRow {
  _sum?: { totalViews?: unknown };
  date: Date;
}
