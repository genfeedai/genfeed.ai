import { contentPlanAttributes } from '@serializers/attributes/content/content-plan.attributes';
import { contentPlanItemAttributes } from '@serializers/attributes/content/content-plan-item.attributes';
import { rel } from '@serializers/builders';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const contentPlanItemSerializerConfig = {
  attributes: contentPlanItemAttributes,
  type: 'content-plan-item',
  ...STANDARD_ENTITY_RELS,
  plan: rel('content-plan', contentPlanAttributes),
};
