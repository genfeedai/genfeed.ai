import { agentRunAttributes } from '@serializers/attributes/automation/agent-run.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const agentRunSerializerConfig = {
  attributes: agentRunAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-run',
  user: USER_REL,
};
