import { contentPlanAttributes } from '../../attributes/content/content-plan.attributes';
import { STANDARD_ENTITY_RELS } from '../../relationships';

export const contentPlanSerializerConfig = {
  attributes: contentPlanAttributes,
  type: 'content-plan',
  ...STANDARD_ENTITY_RELS,
};
