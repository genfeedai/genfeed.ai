import { buildSerializer } from '@serializers/builders';
import { costReportEntrySerializerConfig } from '@serializers/configs';

export const { CostReportEntrySerializer } = buildSerializer(
  'server',
  costReportEntrySerializerConfig,
);
