export interface MetaAdAccountParams {
  limit?: number;
}

export interface MetaCampaignListParams {
  adAccountId: string;
  status?: string;
  limit?: number;
}

export interface MetaInsightRequestParams {
  datePreset?:
    | 'today'
    | 'yesterday'
    | 'last_7d'
    | 'last_14d'
    | 'last_30d'
    | 'last_90d';
  since?: string;
  until?: string;
}

export interface MetaCreativeListParams {
  adAccountId: string;
  limit?: number;
}

export interface MetaCampaignCompareParams {
  campaignIds: string[];
  datePreset?: string;
}

export interface MetaTopPerformerParams {
  adAccountId: string;
  metric: string;
  limit?: number;
}

export interface MetaAdAccountResponse {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  timezone: string;
  status: number;
}

export interface MetaInsightsResponse {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach?: number;
  frequency?: number;
  conversions?: number;
  costPerResult?: number;
  dateStart: string;
  dateStop: string;
}

export interface MetaCreativeResponse {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  callToActionType?: string;
  imageUrl?: string;
  linkUrl?: string;
}
