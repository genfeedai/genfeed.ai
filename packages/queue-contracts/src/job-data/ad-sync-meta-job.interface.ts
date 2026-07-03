export interface MetaAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  adAccountIds: string[];
  lastSyncDate?: string;
}
