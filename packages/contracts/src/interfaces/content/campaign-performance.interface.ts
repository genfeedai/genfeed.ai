/**
 * One organic metric on a Campaign. `value` is null when no member post has
 * provider data in the window — missing is not zero.
 */
export interface ICampaignMetricAvailability {
  availablePostCount: number;
  totalPostCount: number;
  value: number | null;
}

export interface ICampaignPerformancePost {
  comments: number | null;
  engagementRate: number | null;
  id: string;
  likes: number | null;
  platform: string | null;
  saves: number | null;
  shares: number | null;
  status: string;
  views: number | null;
}

export interface ICampaignPerformancePlatform {
  comments: ICampaignMetricAvailability;
  engagements: ICampaignMetricAvailability;
  likes: ICampaignMetricAvailability;
  platform: string;
  saves: ICampaignMetricAvailability;
  shares: ICampaignMetricAvailability;
  views: ICampaignMetricAvailability;
}

export interface ICampaignOrganicTotals {
  clicks: ICampaignMetricAvailability;
  comments: ICampaignMetricAvailability;
  conversions: ICampaignMetricAvailability;
  engagements: ICampaignMetricAvailability;
  likes: ICampaignMetricAvailability;
  saves: ICampaignMetricAvailability;
  shares: ICampaignMetricAvailability;
  views: ICampaignMetricAvailability;
}

/**
 * Organic Campaign analytics for an explicit reporting window.
 * Paid results are a sibling issue and never mix into these totals.
 */
export interface ICampaignPerformance {
  byPlatform: ICampaignPerformancePlatform[];
  campaignId: string;
  id: string;
  organic: ICampaignOrganicTotals;
  postCounts: Record<string, number>;
  posts: ICampaignPerformancePost[];
  windowEnd: string;
  windowStart: string;
}
