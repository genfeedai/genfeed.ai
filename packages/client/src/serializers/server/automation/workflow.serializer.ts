import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { workflowSerializerConfig } from '../../configs';

export const WorkflowSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  workflowSerializerConfig,
);
