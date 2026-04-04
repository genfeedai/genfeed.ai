import { buildSerializer } from '@serializers/builders';
import { agentRunSerializerConfig } from '@serializers/configs';

export const { AgentRunSerializer } = buildSerializer(
  'server',
  agentRunSerializerConfig,
);
