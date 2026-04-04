import { buildSerializer } from '@serializers/builders';
import { byokUsageSummarySerializerConfig } from '@serializers/configs';

export const { ByokUsageSummarySerializer } = buildSerializer(
  'server',
  byokUsageSummarySerializerConfig,
);
