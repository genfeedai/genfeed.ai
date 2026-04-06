import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { workflowExecutionSerializerConfig } from '../../configs';

export const WorkflowExecutionSerializer: BuiltSerializer =
  buildSingleSerializer('server', workflowExecutionSerializerConfig);
