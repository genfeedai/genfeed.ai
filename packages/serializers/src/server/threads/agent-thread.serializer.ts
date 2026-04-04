import { buildSerializer } from '@serializers/builders';
import { agentThreadSerializerConfig } from '@serializers/configs';

const { ThreadSerializer } = buildSerializer(
  'server',
  agentThreadSerializerConfig,
);

export const AgentThreadSerializer = ThreadSerializer;
