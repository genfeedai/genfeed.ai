import { costReportSummaryAttributes } from '@serializers/attributes/billing/cost-report-summary.attributes';
import { simpleConfig } from '@serializers/builders';

export const costReportSummarySerializerConfig = simpleConfig(
  'cost-report-summary',
  costReportSummaryAttributes,
);
