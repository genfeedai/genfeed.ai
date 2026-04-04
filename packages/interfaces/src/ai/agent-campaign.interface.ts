export interface IAgentCampaign {
  id: string;
  organization: string;
  user: string;
  brand?: string;
  label: string;
  brief?: string;
  agents: string[];
  startDate: string;
  endDate?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated: number;
  creditsUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAgentCampaignDto {
  label: string;
  brief?: string;
  brand?: string;
  agents?: string[];
  startDate: string;
  endDate?: string;
  status?: 'draft' | 'active' | 'paused' | 'completed';
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
