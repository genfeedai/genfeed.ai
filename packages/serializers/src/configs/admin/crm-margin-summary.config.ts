import { crmMarginSummaryAttributes } from '@serializers/attributes/admin/crm-margin-summary.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmMarginSummarySerializerConfig = simpleConfig(
  'crm-margin-summary',
  crmMarginSummaryAttributes,
);
