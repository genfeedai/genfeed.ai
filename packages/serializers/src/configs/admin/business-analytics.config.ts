import { businessAnalyticsAttributes } from '@serializers/attributes/admin/business-analytics.attributes';
import { simpleConfig } from '@serializers/builders';

export const businessAnalyticsSerializerConfig = simpleConfig(
  'business-analytics',
  businessAnalyticsAttributes,
);
