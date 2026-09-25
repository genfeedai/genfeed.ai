import { unitEconomicsReportAttributes } from '@serializers/attributes/billing/unit-economics-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const unitEconomicsReportSerializerConfig = simpleConfig(
  'unit-economics-report',
  unitEconomicsReportAttributes,
);
