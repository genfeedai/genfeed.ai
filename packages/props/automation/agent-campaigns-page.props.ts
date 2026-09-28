import type { AgentCampaign } from '@genfeedai/services/automation/agent-campaigns.service';

export interface AgentCampaignItemProps {
  campaign: AgentCampaign;
  /** Needs-you rows lead with a resolving "Review" action instead of "Open". */
  isNeedsYou?: boolean;
}

export interface AgentCampaignProgressProps {
  allocated: number;
  used: number;
  className?: string;
}
