import { buildSerializer } from '@serializers/builders';
import { agentThreadShareSerializerConfig } from '@serializers/configs';

export const { AgentThreadShareSerializer } = buildSerializer(
  'server',
  agentThreadShareSerializerConfig,
);
