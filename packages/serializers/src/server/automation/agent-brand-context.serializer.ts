import { buildSerializer } from '@serializers/builders';
import { agentBrandContextSerializerConfig } from '@serializers/configs/automation/agent-brand-context.config';

export const { AgentBrandContextSerializer } = buildSerializer(
  'server',
  agentBrandContextSerializerConfig,
);
