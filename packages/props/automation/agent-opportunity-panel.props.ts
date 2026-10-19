import type { AgentStrategyOpportunity } from '@services/automation/agent-strategies.service';

export type AgentOpportunityPanelProps = {
  /** The current server page of open opportunities. */
  opportunities: AgentStrategyOpportunity[];
  requestedOpportunityId: string;
  selectedOpportunity: AgentStrategyOpportunity | null;
  isOpportunitiesLoading: boolean;
};
