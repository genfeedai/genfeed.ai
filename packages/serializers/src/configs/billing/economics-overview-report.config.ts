import { economicsOverviewReportAttributes } from '@serializers/attributes/billing/economics-overview-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const economicsOverviewReportSerializerConfig = simpleConfig(
  'economics-overview-report',
  economicsOverviewReportAttributes,
);
