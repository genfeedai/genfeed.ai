import type { CredentialPlatform } from '@genfeedai/enums';

export interface SocialAnalyticsPostJobData {
  id: string;
  credential?: string;
  externalId: string;
  organization: string;
  brand: string;
  platform: CredentialPlatform;
}

export interface SocialAnalyticsJobData {
  posts: SocialAnalyticsPostJobData[];
}
