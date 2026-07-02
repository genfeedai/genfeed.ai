import type { CredentialPlatform } from '@genfeedai/enums';

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
