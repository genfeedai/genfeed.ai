import { buildSerializer } from '@serializers/builders';
import { businessAnalyticsSerializerConfig } from '@serializers/configs';

export const { BusinessAnalyticsSerializer } = buildSerializer(
  'server',
  businessAnalyticsSerializerConfig,
);
