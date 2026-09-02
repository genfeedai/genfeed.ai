import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { IAgentCampaignContentRotation } from '@genfeedai/contracts/interfaces';
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
  [key: string]: unknown;
}
