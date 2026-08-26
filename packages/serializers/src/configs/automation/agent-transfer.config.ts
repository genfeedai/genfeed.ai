import { agentTransferAttributes } from '@serializers/attributes/automation/agent-transfer.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const agentTransferSerializerConfig = {
  attributes: agentTransferAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-transfer',
  user: USER_REL,
};
