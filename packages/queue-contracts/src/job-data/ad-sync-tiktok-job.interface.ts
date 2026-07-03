export interface TikTokAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  advertiserIds: string[];
  lastSyncDate?: string;
}
