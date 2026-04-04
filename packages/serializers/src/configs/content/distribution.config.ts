import { distributionAttributes } from '@serializers/attributes/content/distribution.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const distributionSerializerConfig = {
  attributes: distributionAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'distribution',
  user: USER_REL,
};
