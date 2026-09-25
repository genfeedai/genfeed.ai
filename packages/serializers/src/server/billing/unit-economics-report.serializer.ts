import { buildSerializer } from '@serializers/builders';
import { unitEconomicsReportSerializerConfig } from '@serializers/configs';

export const { UnitEconomicsReportSerializer } = buildSerializer(
  'server',
  unitEconomicsReportSerializerConfig,
);
