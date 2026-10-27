import { harnessActivationReportAttributes } from '@serializers/attributes/admin/harness-activation-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const harnessActivationReportSerializerConfig = simpleConfig(
  'harness-activation-report',
  harnessActivationReportAttributes,
);
