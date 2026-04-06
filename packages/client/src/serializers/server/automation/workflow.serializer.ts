import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { workflowSerializerConfig } from '../../configs';

export const WorkflowSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  workflowSerializerConfig,
);
