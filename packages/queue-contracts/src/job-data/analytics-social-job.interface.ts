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
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: SocialAnalyticsPostJobData[];
}
