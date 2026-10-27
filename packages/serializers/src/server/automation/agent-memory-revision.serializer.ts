import { buildSerializer } from '@serializers/builders';
import { agentMemoryRevisionSerializerConfig } from '@serializers/configs/automation/agent-memory-revision.config';

export const { AgentMemoryRevisionSerializer } = buildSerializer(
  'server',
  agentMemoryRevisionSerializerConfig,
);
