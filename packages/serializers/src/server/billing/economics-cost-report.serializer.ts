import { buildSerializer } from '@serializers/builders';
import { economicsCostReportSerializerConfig } from '@serializers/configs';

export const { EconomicsCostReportSerializer } = buildSerializer(
  'server',
  economicsCostReportSerializerConfig,
);
