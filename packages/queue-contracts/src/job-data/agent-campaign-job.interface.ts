export interface OrchestratorRunJobData {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
}

export interface CampaignMemoryExtractionJobData {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
}

export type TriggerEvaluationJobData = {
  campaignId: string;
  organizationId: string;
  scheduledAt: string;
  userId: string;
};
