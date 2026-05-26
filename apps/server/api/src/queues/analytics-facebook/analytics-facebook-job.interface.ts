import { CredentialPlatform } from '@genfeedai/enums';

export interface FacebookAnalyticsJobData {
  posts: Array<{
    _id: string;
    credential?: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}
