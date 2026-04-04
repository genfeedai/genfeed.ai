export interface GoogleAdsCustomer {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  isManager: boolean;
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: string;
  advertisingChannelType: string;
  budgetAmountMicros?: string;
  startDate?: string;
  endDate?: string;
}

export interface GoogleAdsCampaignMetrics {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  ctr: number;
  averageCpc: number;
  averageCpm: number;
  date?: string;
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
  finalUrls?: string[];
  headlines?: string[];
  descriptions?: string[];
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

export interface GoogleAdsErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      errors: Array<{
        errorCode: Record<string, string>;
        message: string;
      }>;
    }>;
  };
}
