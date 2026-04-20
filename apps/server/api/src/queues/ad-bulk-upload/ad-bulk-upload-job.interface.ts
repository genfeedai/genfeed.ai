export interface AdBulkUploadJobData {
  jobId: string;
  organizationId: string;
  brandId?: string;
  credentialId: string;
  accessToken: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  images: string[];
  videos: string[];
  headlines: string[];
  bodyCopies: string[];
  callToAction?: string;
  linkUrl: string;
}
