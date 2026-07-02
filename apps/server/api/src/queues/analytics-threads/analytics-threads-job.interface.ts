import { CredentialPlatform } from '@genfeedai/enums';

export interface ThreadsAnalyticsJobData {
  posts: Array<{
    id: string;
    credential?: string;
    externalId: string;
    organization: string;
    brand: string;
    platform: CredentialPlatform;
  }>;
}
