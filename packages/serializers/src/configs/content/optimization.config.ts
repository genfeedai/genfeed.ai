import { optimizationAttributes } from '@serializers/attributes/content/optimization.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const optimizationSerializerConfig = {
  attributes: optimizationAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'optimization',
  user: USER_REL,
};
