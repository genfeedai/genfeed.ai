import { buildSerializer } from '@serializers/builders';
import { agentMemorySerializerConfig } from '@serializers/configs/automation/agent-memory.config';

export const { AgentMemorySerializer } = buildSerializer(
  'server',
  agentMemorySerializerConfig,
);
