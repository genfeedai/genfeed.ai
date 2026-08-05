import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { IAgentCampaignContentRotation } from '@genfeedai/interfaces';
import type { AgentCampaign } from '@genfeedai/prisma';

export type { AgentCampaign } from '@genfeedai/prisma';

export interface AgentCampaignDocument extends AgentCampaign {
  agents: Array<string | AgentStrategyDocument>;
  brief?: string;
  contentRotation?: IAgentCampaignContentRotation;
  contentQuota?: {
    images?: number;
    posts?: number;
    videos?: number;
  };
  creditsAllocated: number;
  creditsUsed: number;
  lastOrchestratedAt?: Date | null;
  lastOrchestrationSummary?: string;
  nextOrchestratedAt?: Date | string | null;
  orchestrationIntervalHours?: number;
  status: 'active' | 'completed' | 'draft' | 'paused';
  [key: string]: unknown;
}
