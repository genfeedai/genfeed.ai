import { agentBrandContextAttributes } from '@serializers/attributes/automation/agent-brand-context.attributes';
import { simpleConfig } from '@serializers/builders';

export const agentBrandContextSerializerConfig = simpleConfig(
  'agent-brand-context',
  agentBrandContextAttributes,
);
