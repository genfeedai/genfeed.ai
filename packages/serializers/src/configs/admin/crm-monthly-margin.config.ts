import { crmMonthlyMarginAttributes } from '@serializers/attributes/admin/crm-monthly-margin.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmMonthlyMarginSerializerConfig = simpleConfig(
  'crm-monthly-margin',
  crmMonthlyMarginAttributes,
);
