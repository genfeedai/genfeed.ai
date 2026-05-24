import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentCampaign } from '@genfeedai/prisma';

export type { AgentCampaign } from '@genfeedai/prisma';

export interface AgentCampaignDocument extends AgentCampaign {
  _id: string;
  agents: Array<string | AgentStrategyDocument>;
  brand?: string | null;
  brief?: string;
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
  organization: string;
  status: 'active' | 'completed' | 'draft' | 'paused';
  user: string;
  [key: string]: unknown;
}
