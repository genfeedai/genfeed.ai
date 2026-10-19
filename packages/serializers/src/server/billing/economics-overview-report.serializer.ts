import { buildSerializer } from '@serializers/builders';
import { economicsOverviewReportSerializerConfig } from '@serializers/configs';

export const { EconomicsOverviewReportSerializer } = buildSerializer(
  'server',
  economicsOverviewReportSerializerConfig,
);
