import { buildSerializer } from '@serializers/builders';
import { harnessActivationReportSerializerConfig } from '@serializers/configs';

export const { HarnessActivationReportSerializer } = buildSerializer(
  'server',
  harnessActivationReportSerializerConfig,
);
