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
