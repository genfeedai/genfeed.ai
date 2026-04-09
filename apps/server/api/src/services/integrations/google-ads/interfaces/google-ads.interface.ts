export type {
  GoogleAdsCampaignInput as GoogleAdsCampaign,
  GoogleAdsCampaignMetricsInput as GoogleAdsCampaignMetrics,
  GoogleAdsCustomerInput as GoogleAdsCustomer,
} from '@genfeedai/integrations/ads';

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
