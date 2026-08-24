export type NormalizedAdPlatform = 'google-ads' | 'meta' | 'x_ads';

export type NormalizedAdGranularity = 'account' | 'campaign' | 'adset' | 'ad';

export interface NormalizedAdAccount {
  currency?: string;
  externalAccountId: string;
  name: string;
  platform: NormalizedAdPlatform;
  status?: number | string;
  timezone?: string;
}

export interface NormalizedAdCampaign {
  budgetAmountMicros?: string;
  channelType?: string;
  dailyBudget?: number;
  endDate?: string;
  externalAccountId?: string;
  externalCampaignId: string;
  lifetimeBudget?: number;
  name: string;
  objective?: string;
  platform: NormalizedAdPlatform;
  startDate?: string;
  status?: string;
}

export interface NormalizedAdPerformanceRecord {
  bodyText?: string;
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  clicks: number;
  conversions?: number;
  cpa?: number;
  cpc: number;
  cpm: number;
  ctaText?: string;
  ctr: number;
  currency: string;
  dataConfidence: number;
  date: string;
  externalAccountId: string;
  externalAdId?: string;
  externalAdSetId?: string;
  externalCampaignId?: string;
  granularity: NormalizedAdGranularity;
  headlineText?: string;
  impressions: number;
  platform: NormalizedAdPlatform;
  revenue?: number;
  roas?: number;
  spend: number;
}

export interface NormalizedXAdsRepositoryRecord
  extends Omit<
    NormalizedAdPerformanceRecord,
    'clicks' | 'cpc' | 'cpm' | 'ctr' | 'currency' | 'impressions' | 'spend'
  > {
  advertiserHandle?: string;
  advertiserName?: string;
  clicks?: number;
  cpc?: number;
  cpm?: number;
  creativeContent?: string;
  creativeMediaUrls?: string[];
  ctr?: number;
  currency?: string;
  estimatedReach?: number;
  fundingEntity?: string;
  impressions?: number;
  isHalted?: boolean;
  landingPageUrl?: string;
  performanceScore: null;
  presentationEndDate?: string;
  presentationStartDate?: string;
  reachEstimateMax?: number;
  reachEstimateMin?: number;
  spend?: number;
  targetingCountries?: string[];
  targetingCriteria?: string[];
}

export interface MetaAdAccountInput {
  accountId: string;
  currency: string;
  id: string;
  name: string;
  status: number;
  timezone: string;
}

export interface MetaCampaignInput {
  dailyBudget?: number;
  id: string;
  lifetimeBudget?: number;
  name: string;
  objective: string;
  startTime?: string;
  status: string;
  stopTime?: string;
}

export interface MetaActionValue {
  actionType: string;
  value: string;
}

export interface MetaCampaignInsightInput {
  actionValues?: MetaActionValue[];
  clicks: number;
  conversions?: number;
  costPerResult?: number;
  cpc: number;
  cpm: number;
  ctr: number;
  dateStart: string;
  impressions: number;
  spend: number;
}

export interface GoogleAdsCustomerInput {
  currencyCode: string;
  descriptiveName: string;
  id: string;
  isManager: boolean;
  timeZone: string;
}

export interface GoogleAdsCampaignInput {
  advertisingChannelType: string;
  budgetAmountMicros?: string;
  endDate?: string;
  id: string;
  name: string;
  startDate?: string;
  status: string;
}

export interface GoogleAdsCampaignMetricsInput {
  averageCpc: number;
  averageCpm: number;
  campaignId: string;
  campaignName: string;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  costMicros: number;
  ctr: number;
  date?: string;
  impressions: number;
}

/**
 * Provider-neutral disclosure row. This is deliberately not the undocumented
 * X CSV wire shape: production mapping remains disabled until reviewed,
 * sanitized fixtures establish the real column contract.
 */
export interface XAdsRepositoryExportRowInput {
  adId: string;
  advertiserHandle?: string;
  advertiserName?: string;
  creativeContent?: string;
  creativeMediaUrls?: string[];
  externalAdvertiserId?: string;
  fundingEntity?: string;
  isHalted?: boolean;
  landingPageUrl?: string;
  presentationEndDate?: string;
  presentationStartDate?: string;
  reachEstimateMax?: number;
  reachEstimateMin?: number;
  targetingCountries?: string[];
  targetingCriteria?: string[];
}
