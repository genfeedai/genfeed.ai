export interface TwitterAnalyticsJobData {
  posts: Array<{
    id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  credentialId: string;
}
