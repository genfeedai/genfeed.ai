import { insightAttributes } from '@serializers/attributes/content/insight.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const insightSerializerConfig = {
  attributes: insightAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'insight',
};
