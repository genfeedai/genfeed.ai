export interface CampaignProcessingJobData {
  campaignId: string;
  organizationId: string;
}

export interface CampaignProcessingResult {
  campaignId: string;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}
