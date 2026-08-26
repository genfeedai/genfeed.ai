export interface TikTokAdAccount {
  advertiserId: string;
  advertiserName: string;
  currency: string;
  timezone: string;
  status: string;
  role: string;
}

export interface TikTokCampaign {
  campaignId: string;
  campaignName: string;
  objective: string;
  status: string;
  budgetMode: string;
  budget: number;
  createTime: string;
  modifyTime: string;
}

export interface TikTokAdGroup {
  adgroupId: string;
  adgroupName: string;
  campaignId: string;
  status: string;
  budget: number;
  budgetMode: string;
  optimizationGoal: string;
  billingEvent: string;
  scheduledBudget?: number;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
}

export interface TikTokAd {
  adId: string;
  adName: string;
  adgroupId: string;
  status: string;
  adText?: string;
  imageIds?: string[];
  videoId?: string;
  callToAction?: string;
  landingPageUrl?: string;
}

export interface TikTokInsightsData {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions?: number;
  conversionRate?: number;
  costPerConversion?: number;
  reach?: number;
  frequency?: number;
  videoViews?: number;
  videoViewRate?: number;
  statTimeDay: string;
}

export interface TikTokReportingParams {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics?: string[];
  pageSize?: number;
  page?: number;
}

export interface TikTokApiResponse<T> {
  code: number;
  message: string;
  data: T;
  request_id: string;
}

export interface TikTokPageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

export interface TikTokCampaignListResponse {
  list: Array<{
    campaign_id: string;
    campaign_name: string;
    objective_type: string;
    campaign_type: string;
    status: string;
    budget_mode: string;
    budget: number;
    create_time: string;
    modify_time: string;
  }>;
  page_info: TikTokPageInfo;
}

export interface TikTokAdGroupListResponse {
  list: Array<{
    adgroup_id: string;
    adgroup_name: string;
    campaign_id: string;
    status: string;
    budget: number;
    budget_mode: string;
    optimization_goal: string;
    billing_event: string;
    schedule_start_time?: string;
    schedule_end_time?: string;
  }>;
  page_info: TikTokPageInfo;
}

export interface TikTokAdListResponse {
  list: Array<{
    ad_id: string;
    ad_name: string;
    adgroup_id: string;
    status: string;
    ad_text?: string;
    image_ids?: string[];
    video_id?: string;
    call_to_action?: string;
    landing_page_url?: string;
  }>;
  page_info: TikTokPageInfo;
}

export interface TikTokReportRow {
  dimensions: {
    stat_time_day?: string;
    campaign_id?: string;
    adgroup_id?: string;
    ad_id?: string;
  };
  metrics: {
    spend: string;
    impressions: string;
    clicks: string;
    ctr: string;
    cpc: string;
    cpm: string;
    conversion: string;
    cost_per_conversion: string;
    conversion_rate: string;
    reach: string;
    frequency: string;
    video_views_p25?: string;
    video_views_p50?: string;
    video_views_p75?: string;
    video_views_p100?: string;
  };
}

export interface TikTokCreateCampaignParams {
  campaignName: string;
  objectiveType: string;
  budgetMode: string;
  budget?: number;
  status?: string;
}

export interface TikTokCreateAdGroupParams {
  campaignId: string;
  adgroupName: string;
  budget: number;
  budgetMode: string;
  optimizationGoal: string;
  billingEvent: string;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  targeting?: Record<string, unknown>;
}

export interface TikTokCreateAdParams {
  adgroupId: string;
  adName: string;
  adText?: string;
  imageIds?: string[];
  videoId?: string;
  callToAction?: string;
  landingPageUrl: string;
}

export interface TikTokImageUploadResponse {
  imageId: string;
  imageUrl: string;
}

export interface TikTokVideoUploadResponse {
  videoId: string;
}
