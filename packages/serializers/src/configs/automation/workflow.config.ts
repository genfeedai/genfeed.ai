import { workflowAttributes } from '@serializers/attributes/automation/workflow.attributes';
import { simpleConfig } from '@serializers/builders';

export const workflowSerializerConfig = simpleConfig(
  'workflow',
  workflowAttributes,
);
