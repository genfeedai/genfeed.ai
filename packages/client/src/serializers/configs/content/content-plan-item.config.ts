import { contentPlanAttributes } from '../../attributes/content/content-plan.attributes';
import { contentPlanItemAttributes } from '../../attributes/content/content-plan-item.attributes';
import { rel } from '../../builders';
import { STANDARD_ENTITY_RELS } from '../../relationships';

export const contentPlanItemSerializerConfig = {
  attributes: contentPlanItemAttributes,
  type: 'content-plan-item',
  ...STANDARD_ENTITY_RELS,
  plan: rel('content-plan', contentPlanAttributes),
};
