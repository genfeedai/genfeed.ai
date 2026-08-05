export interface TwitterAnalyticsJobData {
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: Array<{
    brandId: string;
    id: string;
    externalId: string;
    organizationId: string;
  }>;
  credentialId: string;
}
