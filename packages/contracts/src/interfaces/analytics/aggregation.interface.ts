/** Shared analytics response contracts. */
import type { OrganizationCategory, OrganizationLifecycleStatus } from '../..';
import type { IWarmupAccountStatus } from '../admin/warmup-accounts.interface';

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
  /** When the owner was last active in the app. */
  lastActiveAt?: string;
}

export type OrganizationOwnerEmailClass = 'company' | 'personal' | 'unknown';

/** The concierge account (`WarmupAccount`) prepared for an organization. */
export interface IOrganizationConcierge {
  id: string;
  status: IWarmupAccountStatus;
}

export interface IOrganizationWithStats {
  id: string;
  name: string;
  logo?: string;
  owner?: IOrganizationOwner;
  slug?: string;
  /**
   * What the organization said it is at onboarding (`accountType`). Absent
   * until onboarding finishes: `category` always holds a default, so it says
   * nothing about the organization.
   */
  type?: OrganizationCategory;
  /** Onboarding, free, trial, subscribed, past due or cancelled. */
  status: OrganizationLifecycleStatus;
  /** The subscription plan behind `status`, when there is one. */
  plan?: string;
  /** Present when the organization was prepared as a concierge account. */
  concierge?: IOrganizationConcierge;
  /** Whether the owner signed up with a work address, a free provider, or neither is known. */
  ownerEmailClass: OrganizationOwnerEmailClass;
  createdAt?: string;
  /** Generated assets created in the selected date range. */
  totalGenerations: number;
  /** When the owner was last active in the app. */
  lastActiveAt?: string;
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  totalBrands: number;
  totalMembers: number;
  avgEngagementRate: number;
  growth: number;
}

/** Period totals across every entity a list matches, not just the page on screen. */
export interface IEntityStatsTotals {
  totalPosts: number;
  totalViews: number;
  totalEngagement: number;
  /** Engagement change against the previous period, in percent. */
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
