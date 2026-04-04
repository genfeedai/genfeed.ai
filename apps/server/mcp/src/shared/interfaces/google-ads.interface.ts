export interface GoogleAdsCustomerParams {
  limit?: number;
}

export interface GoogleAdsCampaignListParams {
  customerId: string;
  status?: string;
  limit?: number;
  loginCustomerId?: string;
}

export interface GoogleAdsMetricRequestParams {
  customerId: string;
  startDate?: string;
  endDate?: string;
  segmentByDate?: boolean;
  limit?: number;
  loginCustomerId?: string;
}

export interface GoogleAdsKeywordParams {
  customerId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  loginCustomerId?: string;
}

export interface GoogleAdsSearchTermParams {
  customerId: string;
  campaignId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  loginCustomerId?: string;
}

export interface GoogleAdsCustomerResponse {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  isManager: boolean;
}

export interface GoogleAdsCampaignResponse {
  id: string;
  name: string;
  status: string;
  advertisingChannelType: string;
  budgetAmountMicros?: string;
}

export interface GoogleAdsCampaignMetricsResponse {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
  date?: string;
}
