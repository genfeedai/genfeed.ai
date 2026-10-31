/** Shared analytics response contracts. */
import type { OrganizationCategory } from '../..';

export interface IEntityAnalyticsStats {
  avgEngagementRate: number;
  totalEngagement: number;
  totalPosts: number;
  totalViews: number;
  activePlatforms?: string[];
}

/** The user who owns an organization (`organizations.userId`). */
export interface IOrganizationOwner {
  id: string;
  /** Display name, or the email/handle when no name was ever captured. */
  name: string;
  email?: string;
  avatar?: string;
}

export interface IOrganizationWithStats {
  id: string;
  name: string;
  logo?: string;
  owner?: IOrganizationOwner;
  slug?: string;
  /** What the organization said it is: `accountType` (onboarding), else `category`. */
  type?: OrganizationCategory;
  createdAt?: string;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  totalBrands: number;
  totalMembers: number;
  avgEngagementRate: number;
  growth: number;
}

export interface IBrandWithStats {
  id: string;
  name: string;
  logo?: string;
  organizationId: string;
  organizationName: string;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  avgEngagementRate: number;
  activePlatforms: string[];
  growth: number;
}

export interface IOrgLeaderboardItem {
  rank: number;
  organization: {
    id: string;
    name: string;
    logo?: string;
  };
  totalPosts: number;
  totalEngagement: number;
  totalViews: number;
  avgEngagementRate: number;
  growth: number;
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
