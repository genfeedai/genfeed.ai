import type { AgentCampaign } from '@genfeedai/services/automation/agent-campaigns.service';

export interface AgentCampaignItemProps {
  campaign: AgentCampaign;
  /** Needs-you rows lead with a resolving "Review" action instead of "Open". */
  isNeedsYou?: boolean;
}

/** A `common.agentCampaign.relativeTime`-scoped translate, passed to plain
 * formatting helpers that cannot call hooks themselves. */
export type AgentCampaignRelativeTimeTranslate = (
  key: string,
  values?: Record<string, number>,
) => string;

export interface AgentCampaignProgressProps {
  allocated: number;
  used: number;
  className?: string;
}
