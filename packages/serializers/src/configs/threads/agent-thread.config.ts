import { agentThreadAttributes } from '@serializers/attributes/threads/agent-thread.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const agentThreadSerializerConfig = {
  attributes: agentThreadAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'thread',
  user: USER_REL,
};
