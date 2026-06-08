import type { CredentialPlatform } from '@genfeedai/enums';

export interface AdInsightsAggregationJobData {
  insightTypes: string[];
  industries?: string[];
}

export interface GoogleAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  refreshToken: string;
  customerIds: string[];
  loginCustomerId?: string;
  lastSyncDate?: string;
}

export interface SocialAnalyticsPostJobData {
  _id: string;
  externalId: string;
  organization: string;
  brand: string;
  platform: CredentialPlatform;
}

export interface SocialAnalyticsJobData {
  posts: SocialAnalyticsPostJobData[];
}
