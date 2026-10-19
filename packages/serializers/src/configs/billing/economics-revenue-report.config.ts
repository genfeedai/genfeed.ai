import { economicsRevenueReportAttributes } from '@serializers/attributes/billing/economics-revenue-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const economicsRevenueReportSerializerConfig = simpleConfig(
  'economics-revenue-report',
  economicsRevenueReportAttributes,
);
