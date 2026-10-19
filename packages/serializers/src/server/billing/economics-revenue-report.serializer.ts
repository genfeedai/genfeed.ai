import { buildSerializer } from '@serializers/builders';
import { economicsRevenueReportSerializerConfig } from '@serializers/configs';

export const { EconomicsRevenueReportSerializer } = buildSerializer(
  'server',
  economicsRevenueReportSerializerConfig,
);
