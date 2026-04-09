export type NormalizedAdPlatform = 'google-ads' | 'meta';

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
