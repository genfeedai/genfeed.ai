export interface YouTubeAnalyticsJobData {
  posts: Array<{
    id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  organizationId: string;
  brandId: string;
}
