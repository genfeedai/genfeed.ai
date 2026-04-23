export type {
  MetaAdAccountInput as MetaAdAccount,
  MetaCampaignInput as MetaCampaign,
} from '@genfeedai/integrations/ads';

export interface MetaInsightsData {
  actions?: Array<{ action_type?: string; value?: string }>;
  actionValues?: Array<{ action_type?: string; value?: string }>;
  clicks: number;
  conversions?: number;
  costPerResult: number;
  cpc: number;
  cpm: number;
  ctr: number;
  dateStart: string;
  dateStop: string;
  frequency: number;
  impressions: number;
  reach?: number;
  spend: number;
}

export interface MetaInsightsParams {
  datePreset?:
    | 'today'
    | 'yesterday'
    | 'last_7d'
    | 'last_14d'
    | 'last_30d'
    | 'last_90d';
  timeRange?: { since: string; until: string };
  level?: 'campaign' | 'adset' | 'ad';
  fields?: string[];
}

export interface MetaAdCreative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  callToActionType?: string;
  imageUrl?: string;
  videoId?: string;
  linkUrl?: string;
  thumbnailUrl?: string;
}

export interface MetaCampaignComparison {
  campaigns: Array<{
    id: string;
    name: string;
    insights: MetaInsightsData;
  }>;
}

export interface MetaTopPerformer {
  id: string;
  name: string;
  metric: string;
  value: number;
  insights: MetaInsightsData;
}

// ─── Write Operation Interfaces ──────────────────────────────────────────────

export interface CreateCampaignParams {
  name: string;
  objective: string;
  specialAdCategories?: string[];
  dailyBudget?: number;
  lifetimeBudget?: number;
  status?: string;
}

export interface UpdateCampaignParams {
  name?: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface MetaAdSetTargeting {
  geoLocations?: {
    countries?: string[];
    regions?: Array<{ key: string }>;
    cities?: Array<{ key: string; radius?: number; distanceUnit?: string }>;
  };
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  interests?: Array<{ id: string; name: string }>;
  customAudiences?: Array<{ id: string }>;
}

export interface CreateAdSetParams {
  name: string;
  campaignId: string;
  targeting: MetaAdSetTargeting;
  dailyBudget?: number;
  lifetimeBudget?: number;
  billingEvent: string;
  optimizationGoal: string;
  startTime?: string;
  endTime?: string;
}

export interface UpdateAdSetParams {
  name?: string;
  targeting?: MetaAdSetTargeting;
  dailyBudget?: number;
  status?: string;
}

export interface CreateAdCreativeInput {
  title?: string;
  body?: string;
  imageHash?: string;
  videoId?: string;
  linkUrl: string;
  callToAction?: string;
}

export interface CreateAdParams {
  name: string;
  adSetId: string;
  creative: CreateAdCreativeInput;
}

export interface MetaImageUploadResponse {
  hash: string;
  url: string;
}

export interface MetaVideoUploadResponse {
  videoId: string;
}
