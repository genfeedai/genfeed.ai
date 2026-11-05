export const AGENT_CAMPAIGN_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
] as const;

export type AgentCampaignStatus = (typeof AGENT_CAMPAIGN_STATUSES)[number];

export interface IAgentCampaignRotationTarget {
  key: string;
  label?: string;
  platform?: string;
  strategyId?: string;
  topic?: string;
  weight: number;
}

export interface IAgentCampaignContentRotation {
  enabled?: boolean;
  lookbackDays?: number;
  targets?: IAgentCampaignRotationTarget[];
}

export interface IAgentCampaign {
  id: string;
  organizationId: string;
  userId: string;
  brandId?: string;
  label: string;
  brief?: string;
  agents: string[];
  startDate: string;
  endDate?: string;
  status: AgentCampaignStatus;
  contentRotation?: IAgentCampaignContentRotation;
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated: number;
  creditsUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAgentCampaignDto {
  label: string;
  brief?: string;
  brandId?: string;
  agentStrategyIds?: string[];
  startDate: string;
  endDate?: string;
  status?: AgentCampaignStatus;
  contentRotation?: IAgentCampaignContentRotation;
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated?: number;
}

export interface IAgentCampaignStatusResponse {
  campaignId: string;
  status: IAgentCampaign['status'];
  agentsRunning: number;
  contentProduced: number;
  creditsUsed: number;
  creditsAllocated: number;
  contentQuota?: IAgentCampaign['contentQuota'];
}

export interface IAgentCampaignMessage {
  campaignId: string;
  agentId: string;
  type: 'status_update' | 'asset_request' | 'asset_delivered' | 'info';
  payload: Record<string, unknown>;
  timestamp: string;
}
