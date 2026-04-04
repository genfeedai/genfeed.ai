import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { workflowExecutionSerializerConfig } from '../../configs';

export const WorkflowExecutionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  workflowExecutionSerializerConfig,
);
