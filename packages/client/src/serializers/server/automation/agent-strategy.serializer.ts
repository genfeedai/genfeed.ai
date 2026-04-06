import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { agentStrategySerializerConfig } from '../../configs';

export const AgentStrategySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentStrategySerializerConfig,
);
