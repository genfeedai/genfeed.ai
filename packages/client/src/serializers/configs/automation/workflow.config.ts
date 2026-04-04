import { workflowAttributes } from '../../attributes/automation/workflow.attributes';
import { simpleConfig } from '../../builders';

export const workflowSerializerConfig = simpleConfig(
  'workflow',
  workflowAttributes,
);
