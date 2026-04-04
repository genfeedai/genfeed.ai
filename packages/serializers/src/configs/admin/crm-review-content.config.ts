import { crmReviewContentAttributes } from '@serializers/attributes/admin/crm-review-content.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmReviewContentSerializerConfig = simpleConfig(
  'crm-review-content',
  crmReviewContentAttributes,
);
