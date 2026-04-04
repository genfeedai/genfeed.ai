import { buildSerializer } from '@serializers/builders';
import { crmAlignmentSummarySerializerConfig } from '@serializers/configs';

export const { CrmAlignmentSummarySerializer } = buildSerializer(
  'server',
  crmAlignmentSummarySerializerConfig,
);
