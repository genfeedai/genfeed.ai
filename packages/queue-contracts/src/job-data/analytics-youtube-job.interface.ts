export interface YouTubeAnalyticsJobData {
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: Array<{
    id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  organizationId: string;
  brandId: string;
}
