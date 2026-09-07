import type { AgentStrategyOpportunity } from '@services/automation/agent-strategies.service';

export type AgentOpportunityPanelProps = {
  requestedOpportunityId: string;
  selectedOpportunity: AgentStrategyOpportunity | null;
  isOpportunitiesLoading: boolean;
};
