import { insightAttributes } from '../../attributes/content/insight.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const insightSerializerConfig = {
  attributes: insightAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'insight',
};
