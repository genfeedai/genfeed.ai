import { agentStrategyOpportunityAttributes } from '@serializers/attributes/automation/agent-strategy-opportunity.attributes';
import { simpleConfig } from '@serializers/builders';

export const agentStrategyOpportunitySerializerConfig = simpleConfig(
  'agent-strategy-opportunity',
  agentStrategyOpportunityAttributes,
);
