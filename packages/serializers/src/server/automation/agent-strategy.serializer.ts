import { buildSerializer } from '@serializers/builders';
import { agentStrategySerializerConfig } from '@serializers/configs';

export const { AgentStrategySerializer } = buildSerializer(
  'server',
  agentStrategySerializerConfig,
);
