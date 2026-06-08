export interface TwitterAnalyticsJobData {
  posts: Array<{
    _id: string;
    externalId: string;
    organization: string;
    brand: string;
  }>;
  credentialId: string;
}
