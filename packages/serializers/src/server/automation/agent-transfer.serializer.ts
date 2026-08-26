import { buildSerializer } from '@serializers/builders';
import { agentTransferSerializerConfig } from '@serializers/configs';

export const { AgentTransferSerializer } = buildSerializer(
  'server',
  agentTransferSerializerConfig,
);
