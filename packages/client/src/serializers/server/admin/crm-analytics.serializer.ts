import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmAnalyticsSerializerConfig } from '../../configs';

export const CrmAnalyticsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmAnalyticsSerializerConfig,
);
