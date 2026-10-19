import { economicsCoverageReportAttributes } from '@serializers/attributes/billing/economics-coverage-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const economicsCoverageReportSerializerConfig = simpleConfig(
  'economics-coverage-report',
  economicsCoverageReportAttributes,
);
