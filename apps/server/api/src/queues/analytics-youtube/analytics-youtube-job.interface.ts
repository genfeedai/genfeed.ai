export interface YouTubeAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  organizationId: string;
  brandId: string;
}
