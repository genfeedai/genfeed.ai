import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmMonthlyMarginSerializerConfig } from '../../configs';

export const CrmMonthlyMarginSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmMonthlyMarginSerializerConfig,
);
