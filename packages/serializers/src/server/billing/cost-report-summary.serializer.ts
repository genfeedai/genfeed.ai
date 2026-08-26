import { buildSerializer } from '@serializers/builders';
import { costReportSummarySerializerConfig } from '@serializers/configs';

export const { CostReportSummarySerializer } = buildSerializer(
  'server',
  costReportSummarySerializerConfig,
);
