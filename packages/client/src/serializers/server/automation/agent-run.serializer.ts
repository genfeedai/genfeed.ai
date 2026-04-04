import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { agentRunSerializerConfig } from '../../configs';

export const AgentRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentRunSerializerConfig,
);
