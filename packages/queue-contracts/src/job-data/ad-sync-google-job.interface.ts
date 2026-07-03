export interface GoogleAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  refreshToken: string;
  customerIds: string[];
  loginCustomerId?: string;
  lastSyncDate?: string;
}
