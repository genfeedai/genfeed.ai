export type XAdsEntityStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';

export interface XAdsOAuthTokens {
  accessToken: string;
  accessTokenSecret: string;
  screenName?: string;
  userId?: string;
}

export type XAdsRequestCredentials = Pick<
  XAdsOAuthTokens,
  'accessToken' | 'accessTokenSecret'
>;

export interface XAdsAccount {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  approvalStatus: string;
}

export interface XAdsFundingInstrument {
  id: string;
  type: string;
  entityStatus: XAdsEntityStatus;
  currency: string;
}

export interface XAdsCampaign {
  id: string;
  name: string;
  fundingInstrumentId: string;
  entityStatus: XAdsEntityStatus;
  dailyBudgetAmountLocalMicro?: number;
  totalBudgetAmountLocalMicro?: number;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface XAdsLineItem {
  id: string;
  campaignId: string;
  name: string;
  entityStatus: XAdsEntityStatus;
  productType: string;
  objective: string;
  bidAmountLocalMicro?: number;
  dailyBudgetAmountLocalMicro?: number;
  totalBudgetAmountLocalMicro?: number;
  targeting?: Record<string, unknown>;
  placements?: string[];
  startTime?: string;
  endTime?: string;
}

export interface XAdsPromotedTweet {
  id: string;
  lineItemId: string;
  tweetId: string;
  entityStatus: XAdsEntityStatus;
  approvalStatus: string;
}

export interface XAdsTweet {
  id: string;
}

export interface XAdsInsightsMetrics {
  impressions: number;
  clicks: number;
  billedCharge: number;
  billedEngagements?: number;
  conversions?: number;
  conversionValue?: number;
}

export interface XAdsInsightsRow {
  id: string;
  startTime: string;
  endTime: string;
  metrics: XAdsInsightsMetrics;
}

export interface XAdsReportingParams {
  startDate: string;
  endDate: string;
  granularity?: 'DAY' | 'HOUR' | 'TOTAL';
  entity?: 'CAMPAIGN' | 'LINE_ITEM' | 'PROMOTED_TWEET';
}

/**
 * Wire envelope for the X Ads API v12 REST responses. List endpoints carry
 * `next_cursor`; single-resource endpoints omit it.
 */
export interface XAdsApiResponse<T> {
  request?: {
    params?: Record<string, unknown>;
  };
  data: T;
  data_type?: string;
  next_cursor?: string | null;
}

export interface XAdsApiError {
  errors: Array<{
    code: number;
    message: string;
  }>;
}

export interface XAdsCreateCampaignParams {
  name: string;
  fundingInstrumentId: string;
  entityStatus: XAdsEntityStatus;
  dailyBudgetAmountLocalMicro?: number;
  totalBudgetAmountLocalMicro?: number;
  startTime?: string;
  endTime?: string;
}

export interface XAdsCreateLineItemParams {
  campaignId: string;
  name: string;
  entityStatus: XAdsEntityStatus;
  productType: string;
  objective: string;
  bidAmountLocalMicro?: number;
  dailyBudgetAmountLocalMicro?: number;
  totalBudgetAmountLocalMicro?: number;
  targeting?: Record<string, unknown>;
  placements?: string[];
  startTime?: string;
  endTime?: string;
}

export interface XAdsCreatePromotedTweetParams {
  lineItemId: string;
  tweetId: string;
}
