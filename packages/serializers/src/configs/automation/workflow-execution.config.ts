import { workflowExecutionAttributes } from '@serializers/attributes/automation/workflow-execution.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const workflowExecutionSerializerConfig = {
  attributes: workflowExecutionAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'workflow-execution',
  user: USER_REL,
};
