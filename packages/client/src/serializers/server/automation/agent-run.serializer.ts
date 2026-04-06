import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { agentRunSerializerConfig } from '../../configs';

export const AgentRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentRunSerializerConfig,
);
