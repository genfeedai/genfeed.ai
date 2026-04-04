import type { Types } from 'mongoose';

/**
 * Analytics aggregation result interfaces
 * Used for type-safe MongoDB aggregation results in analytics services
 */

export interface IEntityAnalyticsStats {
  avgEngagementRate: number;
  totalEngagement: number;
  totalPosts: number;
  totalViews: number;
  activePlatforms?: string[];
}

export interface IAggregatedAnalyticsResult {
  _id: Types.ObjectId | string;
  avgEngagementRate: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalViews: number;
  posts: (Types.ObjectId | string)[];
  platforms?: string[];
}

export interface IAggregatedEngagementResult {
  _id: Types.ObjectId | string;
  totalEngagement: number;
}

export interface IOrganizationWithStats {
  _id: Types.ObjectId | string;
  name: string;
  label?: string;
  logo?: string;
  isActive?: boolean;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  avgEngagementRate: number;
  engagementGrowth: number;
  rank?: number;
}

export interface IBrandWithStats {
  _id: Types.ObjectId | string;
  name: string;
  label?: string;
  logo?: string;
  organization: Types.ObjectId | string;
  isActive?: boolean;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  avgEngagementRate: number;
  activePlatforms: string[];
  engagementGrowth: number;
  rank?: number;
}

export interface ITimeSeriesAggregationResult {
  _id: {
    date: Date;
    platform?: string;
  };
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface IPlatformAggregationResult {
  _id: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface IPostCountAggregationResult {
  _id: Types.ObjectId | string;
  count: number;
}

export interface ITrendAggregationResult {
  platform: string;
  name: string;
  tweetVolume?: number;
  url?: string;
  query?: string;
  promoted?: boolean;
}

export interface ILeaderboardEntry {
  id: string;
  name: string;
  label?: string;
  logo?: string;
  rank: number;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  avgEngagementRate: number;
  engagementGrowth: number;
  activePlatforms?: string[];
}

export interface IAnalyticsMatchStage {
  organization?: Types.ObjectId | string;
  brand?: Types.ObjectId | string;
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
  platform?: string;
  isDeleted?: boolean;
}

export interface IAnalyticsGroupFields {
  _id: string;
  avgEngagementRate?: { $avg: string };
  totalViews?: { $sum: string };
  totalLikes?: { $sum: string };
  totalComments?: { $sum: string };
  totalShares?: { $sum: string };
  totalSaves?: { $sum: string };
  posts?: { $addToSet: string };
  platforms?: { $addToSet: string };
}

/**
 * Pipeline result interfaces for analytics-aggregation.service.ts
 * Each interface maps to the output shape of a specific aggregation pipeline.
 */

/** Result of getTimeSeriesData pipeline after $project */
export interface ITimeSeriesProjectedResult {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  totalEngagement: number;
}

/** Platform metrics within a grouped time series result */
export interface ITimeSeriesPlatformAggMetrics {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

/** Result of getTimeSeriesDataWithPlatforms pipeline (second $group) */
export interface ITimeSeriesGroupedByDateResult {
  _id: string;
  platforms: ITimeSeriesPlatformAggMetrics[];
}

/** Result of getPlatformComparison pipeline after $project + $addFields */
export interface IPlatformComparisonProjectedResult {
  _id: string;
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

/** Result of getTopPerformingContent pipeline after $project */
export interface ITopContentProjectedResult {
  _id: string;
  postId: string;
  ingredientId: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  title: string;
  description: string;
  publishDate: Date;
  url?: string;
}

/** Platform metrics in viral hooks aggregation */
export interface IViralHookPlatformAggResult {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

/** Result of getViralHooksSummary pipeline after $project */
export interface IViralHookAggResult {
  _id: Types.ObjectId;
  platforms: IViralHookPlatformAggResult[];
  post: {
    createdAt: Date;
    description: string;
    label: string;
    publicationDate: Date;
    url: string;
  } | null;
  totalViews: number;
}

/** YouTube video statistics result */
export interface IYouTubeVideoStats {
  comments: number;
  dislikes?: number;
  duration: number;
  engagementRate?: number;
  favorites?: number;
  likes: number;
  mediaType: 'short' | 'video';
  views: number;
}

/** Platform metrics in API time series response (shared between backend response and frontend consumer) */
export interface ITimeSeriesPlatformMetricsResponse {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

/** Time series API response data point with platform breakdown */
export interface ITimeSeriesApiDataPoint {
  date: string;
  instagram?: ITimeSeriesPlatformMetricsResponse;
  tiktok?: ITimeSeriesPlatformMetricsResponse;
  youtube?: ITimeSeriesPlatformMetricsResponse;
  facebook?: ITimeSeriesPlatformMetricsResponse;
  twitter?: ITimeSeriesPlatformMetricsResponse;
  linkedin?: ITimeSeriesPlatformMetricsResponse;
  reddit?: ITimeSeriesPlatformMetricsResponse;
  pinterest?: ITimeSeriesPlatformMetricsResponse;
  medium?: ITimeSeriesPlatformMetricsResponse;
}
