import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmMarginSummarySerializerConfig } from '../../configs';

export const CrmMarginSummarySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmMarginSummarySerializerConfig,
);
