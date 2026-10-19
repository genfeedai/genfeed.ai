import { buildSerializer } from '@serializers/builders';
import { agentStrategyOpportunitySerializerConfig } from '@serializers/configs/automation/agent-strategy-opportunity.config';

export const { AgentStrategyOpportunitySerializer } = buildSerializer(
  'server',
  agentStrategyOpportunitySerializerConfig,
);
