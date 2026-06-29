/** Parameter types for the ad-insights (content-loop) section of AdsClient. */

export interface AdInsightsParams {
  industry?: string;
  platform?: string;
}

export interface AdHeadlineParams {
  industry?: string;
  platform?: string;
  product?: string;
}

export interface AdVariationsParams {
  headline?: string;
  body?: string;
  platform?: string;
  count?: number;
}
