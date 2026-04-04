import { buildSerializer } from '@serializers/builders';
import { workflowSerializerConfig } from '@serializers/configs';

export const { WorkflowSerializer } = buildSerializer(
  'server',
  workflowSerializerConfig,
);
