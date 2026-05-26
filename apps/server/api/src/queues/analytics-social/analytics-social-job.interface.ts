import { CredentialPlatform } from '@genfeedai/enums';

export interface SocialAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}
