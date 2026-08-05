export interface YouTubeAnalyticsJobData {
  /** Idempotency key for the canonical target collection attempt. */
  attemptKey?: string;
  posts: Array<{
    brandId: string;
    id: string;
    externalId: string;
    organizationId: string;
  }>;
  organizationId: string;
  brandId: string;
}
