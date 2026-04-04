import { buildSerializer } from '@serializers/builders';
import { crmAnalyticsSerializerConfig } from '@serializers/configs';

export const { CrmAnalyticsSerializer } = buildSerializer(
  'server',
  crmAnalyticsSerializerConfig,
);
