import { agentStrategyAttributes } from '@serializers/attributes/automation/agent-strategy.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const agentStrategySerializerConfig = {
  attributes: agentStrategyAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-strategy',
  user: USER_REL,
};
