import { crmAnalyticsAttributes } from '@serializers/attributes/admin/crm-analytics.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmAnalyticsSerializerConfig = simpleConfig(
  'crm-analytics',
  crmAnalyticsAttributes,
);
