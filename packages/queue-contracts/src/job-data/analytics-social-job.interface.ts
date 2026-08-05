import type { CredentialPlatform } from '@genfeedai/enums';

export interface SocialAnalyticsPostJobData {
  brandId: string;
  credentialId?: string;
  id: string;
  externalId: string;
  organizationId: string;
  platform: CredentialPlatform;
}

export interface SocialAnalyticsJobData {
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: SocialAnalyticsPostJobData[];
}
