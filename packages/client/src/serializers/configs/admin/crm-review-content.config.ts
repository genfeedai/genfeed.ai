import { crmReviewContentAttributes } from '../../attributes/admin/crm-review-content.attributes';
import { simpleConfig } from '../../builders';

export const crmReviewContentSerializerConfig = simpleConfig(
  'crm-review-content',
  crmReviewContentAttributes,
);
