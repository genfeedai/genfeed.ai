export type {
  GoogleAdsCampaignInput as GoogleAdsCampaign,
  GoogleAdsCampaignMetricsInput as GoogleAdsCampaignMetrics,
  GoogleAdsCustomerInput as GoogleAdsCustomer,
} from '@genfeedai/integrations/ads';

/**
 * An account the operator can connect: a client account that runs campaigns.
 * Manager accounts only group other accounts, so they are never selectable;
 * their clients are, carrying the manager's id as `managerId` because every
 * read of a manager-linked client sends it as the `login-customer-id` header.
 */
export interface GoogleAdsSelectableAccount {
  currencyCode?: string;
  id: string;
  managerId?: string;
  managerName?: string;
  name: string;
}

export interface GoogleAdsAdGroupInsights {
  adGroupId: string;
  adGroupName: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
}

export interface GoogleAdsAdInsights {
  adId: string;
  adName: string;
  adGroupName: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
}

export interface GoogleAdsAdGroup {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  cpcBidMicros?: string;
}

export interface GoogleAdsAd {
  id: string;
  adGroupId: string;
  name: string;
  status: string;
  advertisingChannelType?: string;
  finalUrls?: string[];
  headlines?: string[];
  descriptions?: string[];
  youtubeVideoId?: string;
}

export interface GoogleAdsUpdateCampaignInput {
  name?: string;
  status?: string;
  dailyBudget?: number;
}

export interface GoogleAdsCreateAdGroupInput {
  campaignId: string;
  name: string;
  cpcBidMicros?: number;
}

export interface GoogleAdsCreateResponsiveSearchAdInput {
  adGroupId: string;
  name: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
}

export interface GoogleAdsKeywordPerformance {
  keywordText: string;
  matchType: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
  qualityScore?: number;
}

export interface GoogleAdsSearchTerm {
  searchTerm: string;
  keywordText: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
}

export interface GoogleAdsMetricsParams {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  segmentByDate?: boolean;
  limit?: number;
}

export interface GoogleAdsOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}
