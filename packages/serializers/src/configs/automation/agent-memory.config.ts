import { agentMemoryAttributes } from '@serializers/attributes/automation/agent-memory.attributes';
import { simpleConfig } from '@serializers/builders';

export const agentMemorySerializerConfig = simpleConfig(
  'agent-memory',
  agentMemoryAttributes,
);
