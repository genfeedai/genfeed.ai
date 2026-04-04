export type AdsPlatform = 'meta' | 'google' | 'tiktok';

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

export interface AdsAdapterContext {
  organizationId: string;
  brandId?: string;
  credentialId: string;
  accessToken: string;
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
    params?: {
      datePreset?: string;
      timeRange?: { since: string; until: string };
    },
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
  pauseCampaign(ctx: AdsAdapterContext, campaignId: string): Promise<void>;
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
