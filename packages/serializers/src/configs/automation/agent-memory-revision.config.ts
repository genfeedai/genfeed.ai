import { agentMemoryRevisionAttributes } from '@serializers/attributes/automation/agent-memory-revision.attributes';
import { simpleConfig } from '@serializers/builders';

export const agentMemoryRevisionSerializerConfig = simpleConfig(
  'agent-memory-revision',
  agentMemoryRevisionAttributes,
);
