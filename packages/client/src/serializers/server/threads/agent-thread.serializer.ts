import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { agentThreadSerializerConfig } from '../../configs';

export const AgentThreadSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentThreadSerializerConfig,
);
