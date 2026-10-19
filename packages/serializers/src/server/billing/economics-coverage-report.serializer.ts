import { buildSerializer } from '@serializers/builders';
import { economicsCoverageReportSerializerConfig } from '@serializers/configs';

export const { EconomicsCoverageReportSerializer } = buildSerializer(
  'server',
  economicsCoverageReportSerializerConfig,
);
