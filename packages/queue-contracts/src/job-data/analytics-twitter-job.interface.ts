export interface TwitterAnalyticsJobData {
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: Array<{
    id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  credentialId: string;
}
