export type AdsPlatform = 'meta' | 'google' | 'tiktok' | 'x';

export interface UnifiedAdAccount {
  id: string;
  name: string;
  platform: AdsPlatform;
  currency: string;
  timezone: string;
  status: string;
}

export interface UnifiedCampaign {
  id: string;
  name: string;
  platform: AdsPlatform;
  objective: string;
  status: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startDate?: string;
  endDate?: string;
}

export interface UnifiedAdSet {
  id: string;
  name: string;
  platform: AdsPlatform;
  campaignId: string;
  status: string;
  dailyBudget?: number;
  targeting?: Record<string, unknown>;
  optimizationGoal?: string;
}

export interface UnifiedAd {
  id: string;
  name: string;
  platform: AdsPlatform;
  adSetId: string;
  status: string;
  creative?: {
    title?: string;
    body?: string;
    imageUrl?: string;
    videoId?: string;
    linkUrl?: string;
    callToAction?: string;
  };
}

export interface UnifiedInsights {
  platform: AdsPlatform;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions?: number;
  revenue?: number;
  roas?: number;
  cpa?: number;
  dateStart: string;
  dateStop: string;
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  status?: string;
  specialAdCategories?: string[];
}

export interface UpdateCampaignInput {
  name?: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface CreateAdSetInput {
  name: string;
  campaignId: string;
  targeting: Record<string, unknown>;
  dailyBudget?: number;
  lifetimeBudget?: number;
  billingEvent?: string;
  optimizationGoal?: string;
  startTime?: string;
  endTime?: string;
}

export interface CreateAdInput {
  name: string;
  adSetId: string;
  creative: {
    title?: string;
    body?: string;
    imageHash?: string;
    videoId?: string;
    linkUrl: string;
    callToAction?: string;
  };
}

export interface AdsInsightsParams {
  datePreset?: string;
  timeRange?: { since: string; until: string };
}

export interface AdsAdapterContext {
  organizationId: string;
  brandId?: string;
  credentialId: string;
  accessToken: string;
  accessTokenSecret?: string;
  refreshToken?: string;
  adAccountId: string;
  loginCustomerId?: string;
  developerToken?: string;
}

export interface IAdsAdapter {
  platform: AdsPlatform;
  getAdAccounts(ctx: AdsAdapterContext): Promise<UnifiedAdAccount[]>;
  listCampaigns(ctx: AdsAdapterContext): Promise<UnifiedCampaign[]>;
  getCampaignInsights(
    ctx: AdsAdapterContext,
    campaignId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights>;
  /**
   * Insights for one ad set (Meta), ad group (Google), or ad group (TikTok).
   * Every supported platform exposes this level natively — Meta via
   * `{adSetId}/insights`, Google via a GAQL `FROM ad_group` report, TikTok via
   * `report/integrated/get` at `AUCTION_ADGROUP` data level.
   */
  getAdSetInsights(
    ctx: AdsAdapterContext,
    adSetId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights>;
  /**
   * Insights for a single ad. Meta reports on `{adId}/insights`, Google on a
   * GAQL `FROM ad_group_ad` report, TikTok at `AUCTION_AD` data level.
   */
  getAdInsights(
    ctx: AdsAdapterContext,
    adId: string,
    params?: AdsInsightsParams,
  ): Promise<UnifiedInsights>;
  createCampaign(
    ctx: AdsAdapterContext,
    input: CreateCampaignInput,
  ): Promise<UnifiedCampaign>;
  updateCampaign(
    ctx: AdsAdapterContext,
    campaignId: string,
    input: UpdateCampaignInput,
  ): Promise<UnifiedCampaign>;
  listAdSets(
    ctx: AdsAdapterContext,
    campaignId: string,
  ): Promise<UnifiedAdSet[]>;
  createAdSet(
    ctx: AdsAdapterContext,
    input: CreateAdSetInput,
  ): Promise<UnifiedAdSet>;
  listAds(ctx: AdsAdapterContext, adSetId?: string): Promise<UnifiedAd[]>;
  createAd(ctx: AdsAdapterContext, input: CreateAdInput): Promise<UnifiedAd>;
  getTopPerformers(
    ctx: AdsAdapterContext,
    params?: { metric?: string; limit?: number; datePreset?: string },
  ): Promise<
    Array<{
      id: string;
      name: string;
      metric: string;
      value: number;
      insights: UnifiedInsights;
    }>
  >;
}

export interface CrossPlatformComparison {
  platforms: Array<{
    platform: AdsPlatform;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    avgCtr: number;
    avgCpc: number;
    avgCpm: number;
    totalConversions?: number;
    avgRoas?: number;
    campaignCount: number;
  }>;
  bestPerformer: {
    platform: AdsPlatform;
    metric: string;
    reason: string;
  };
}
