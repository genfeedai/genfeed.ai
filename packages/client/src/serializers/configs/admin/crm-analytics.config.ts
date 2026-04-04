import { crmAnalyticsAttributes } from '../../attributes/admin/crm-analytics.attributes';
import { simpleConfig } from '../../builders';

export const crmAnalyticsSerializerConfig = simpleConfig(
  'crm-analytics',
  crmAnalyticsAttributes,
);
