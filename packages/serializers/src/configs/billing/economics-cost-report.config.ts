import { economicsCostReportAttributes } from '@serializers/attributes/billing/economics-cost-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const economicsCostReportSerializerConfig = simpleConfig(
  'economics-cost-report',
  economicsCostReportAttributes,
);
