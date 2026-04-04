import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmAnalyticsSerializerConfig } from '../../configs';

export const CrmAnalyticsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmAnalyticsSerializerConfig,
);
