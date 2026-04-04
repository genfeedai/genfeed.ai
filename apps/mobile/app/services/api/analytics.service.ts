import { apiRequest } from '@/services/api/base-http.service';

export interface AnalyticsOverview {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalEngagement: number;
  avgEngagementRate: number;
  totalPosts: number;
  viewsGrowth: number;
  engagementGrowth: number;
}

export interface TopContent {
  id: string;
  title: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  thumbnailUrl?: string;
  publishedAt: string;
}

export interface PlatformStats {
  platform: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalPosts: number;
  engagementRate: number;
}

export interface GrowthData {
  date: string;
  views: number;
  engagement: number;
  posts: number;
}

export interface EngagementBreakdown {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalEngagement: number;
  likesPercentage: number;
  commentsPercentage: number;
  sharesPercentage: number;
  savesPercentage: number;
}

interface JsonApiWrapper<T> {
  data: {
    id: string;
    type: string;
    attributes: T;
  };
}

interface JsonApiArrayWrapper<T> {
  data: Array<{
    id: string;
    type: string;
    attributes: T;
  }>;
}

export type AnalyticsOverviewResponse = JsonApiWrapper<AnalyticsOverview>;
export type TopContentResponse = JsonApiArrayWrapper<TopContent>;
export type PlatformStatsResponse = JsonApiArrayWrapper<PlatformStats>;
export type GrowthDataResponse = JsonApiArrayWrapper<GrowthData>;
export type EngagementResponse = JsonApiWrapper<EngagementBreakdown>;

export interface AnalyticsQueryOptions {
  startDate?: string;
  endDate?: string;
  brand?: string;
  metric?: string;
  limit?: number;
  platform?: string;
}

class AnalyticsService {
  private request<T>(
    token: string,
    endpoint: string,
    options?: AnalyticsQueryOptions,
  ): Promise<T> {
    return apiRequest<T>(token, `analytics/${endpoint}`, {
      params: options as Record<string, string | number | undefined>,
    });
  }

  getOverview(
    token: string,
    options?: AnalyticsQueryOptions,
  ): Promise<AnalyticsOverviewResponse> {
    return this.request<AnalyticsOverviewResponse>(token, 'overview', options);
  }

  getTopContent(
    token: string,
    options?: AnalyticsQueryOptions,
  ): Promise<TopContentResponse> {
    return this.request<TopContentResponse>(token, 'top', options);
  }

  getPlatformStats(
    token: string,
    options?: AnalyticsQueryOptions,
  ): Promise<PlatformStatsResponse> {
    return this.request<PlatformStatsResponse>(token, 'platforms', options);
  }

  getGrowthTrends(
    token: string,
    options?: AnalyticsQueryOptions,
  ): Promise<GrowthDataResponse> {
    return this.request<GrowthDataResponse>(token, 'growth', options);
  }

  getEngagement(
    token: string,
    options?: AnalyticsQueryOptions,
  ): Promise<EngagementResponse> {
    return this.request<EngagementResponse>(token, 'engagement', options);
  }
}

export const analyticsService = new AnalyticsService();
