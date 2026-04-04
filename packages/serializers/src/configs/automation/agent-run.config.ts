import { agentRunAttributes } from '@serializers/attributes/automation/agent-run.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const agentRunSerializerConfig = {
  attributes: agentRunAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-run',
  user: USER_REL,
};
