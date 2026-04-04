import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { agentThreadSerializerConfig } from '../../configs';

export const AgentThreadSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentThreadSerializerConfig,
);
