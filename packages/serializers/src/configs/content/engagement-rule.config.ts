import { engagementRuleAttributes } from '@serializers/attributes/content/engagement-rule.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const engagementRuleSerializerConfig = {
  attributes: engagementRuleAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'engagement-rule',
  user: USER_REL,
};
