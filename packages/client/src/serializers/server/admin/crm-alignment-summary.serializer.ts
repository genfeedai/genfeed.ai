import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmAlignmentSummarySerializerConfig } from '../../configs';

export const CrmAlignmentSummarySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmAlignmentSummarySerializerConfig,
);
