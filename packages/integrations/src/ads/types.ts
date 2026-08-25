export type NormalizedAdPlatform = 'google-ads' | 'meta' | 'tiktok' | 'x_ads';

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

/**
 * A creative observed in a public paid-transparency source (Meta Ad Library,
 * TikTok Creative Center, Google Ads Transparency Center, X DSA Ads
 * Repository). Every metric a transparency source does not disclose stays
 * absent instead of being defaulted to zero, and `performanceScore: null`
 * means explicitly unscored rather than poorly performing.
 */
export interface NormalizedPaidCreativeRecord
  extends Omit<
    NormalizedAdPerformanceRecord,
    'clicks' | 'cpc' | 'cpm' | 'ctr' | 'currency' | 'impressions' | 'spend'
  > {
  adFormat?: string;
  advertiserHandle?: string;
  advertiserName?: string;
  clicks?: number;
  cpc?: number;
  cpm?: number;
  creativeContent?: string;
  creativeMediaUrls?: string[];
  creativeType?: PaidCreativeType;
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
  usagePolicy: PaidCreativeUsagePolicy;
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

export type PaidCreativeType =
  | 'carousel'
  | 'image'
  | 'post'
  | 'text'
  | 'unknown'
  | 'video';

/**
 * Public paid-transparency sources we can read competitor creatives from.
 * `youtube_ads_library` is deliberately absent: YouTube ads are Google Ads
 * video creatives and are disclosed through the Google Ads Transparency
 * Center, not through a separate YouTube archive.
 */
export type PaidCreativeProvider =
  | 'google_ads_transparency_center'
  | 'manual_paid_reference'
  | 'meta_ads_library'
  | 'tiktok_creative_center'
  | 'x_ads_repository';

/** Watchlist platform ids as the product spells them. */
export type PaidCreativePlatform =
  | 'google'
  | 'meta'
  | 'tiktok'
  | 'x'
  | 'youtube';

/**
 * Whether a provider's terms let a creative be used as remix input, or only
 * be shown as a disclosure record. X's DSA repository is disclosure data
 * about named advertisers and never feeds a remix.
 */
export type PaidCreativeUsagePolicy = 'disclosure_only' | 'remix_allowed';

export interface MetaAdLibraryRowInput {
  adArchiveId: string;
  adFormat?: string;
  bodyText?: string;
  ctaText?: string;
  creativeMediaUrls?: string[];
  endDate?: string;
  headlineText?: string;
  isActive?: boolean;
  landingPageUrl?: string;
  pageId?: string;
  pageName?: string;
  publisherPlatforms?: string[];
  reachEstimateMax?: number;
  reachEstimateMin?: number;
  startDate?: string;
  targetingCountries?: string[];
}

export interface TikTokCreativeCenterRowInput {
  adFormat?: string;
  advertiserHandle?: string;
  advertiserName?: string;
  bodyText?: string;
  ctaText?: string;
  ctr?: number;
  creativeMediaUrls?: string[];
  endDate?: string;
  id: string;
  landingPageUrl?: string;
  startDate?: string;
  targetingCountries?: string[];
  videoViews?: number;
}
