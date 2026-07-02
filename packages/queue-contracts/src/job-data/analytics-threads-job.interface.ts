import type { CredentialPlatform } from '@genfeedai/enums';

export interface ThreadsAnalyticsJobData {
  posts: Array<{
    _id: string;
    credential?: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}
