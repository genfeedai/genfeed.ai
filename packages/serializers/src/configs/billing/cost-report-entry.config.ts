import { costReportEntryAttributes } from '@serializers/attributes/billing/cost-report-entry.attributes';
import { simpleConfig } from '@serializers/builders';

export const costReportEntrySerializerConfig = simpleConfig(
  'cost-report-entry',
  costReportEntryAttributes,
);
