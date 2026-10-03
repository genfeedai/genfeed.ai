import { creditHoldReportAttributes } from '@serializers/attributes/admin/credit-hold-report.attributes';
import { simpleConfig } from '@serializers/builders';
export const creditHoldReportSerializerConfig = simpleConfig(
  'credit-hold-report',
  creditHoldReportAttributes,
);
