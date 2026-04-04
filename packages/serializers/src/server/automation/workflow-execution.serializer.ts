import { buildSerializer } from '@serializers/builders';
import { workflowExecutionSerializerConfig } from '@serializers/configs';

export const { WorkflowExecutionSerializer } = buildSerializer(
  'server',
  workflowExecutionSerializerConfig,
);
