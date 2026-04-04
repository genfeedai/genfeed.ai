import { buildSerializer } from '@serializers/builders';
import { performanceSummarySerializerConfig } from '@serializers/configs';

export const { PerformanceSummarySerializer } = buildSerializer(
  'server',
  performanceSummarySerializerConfig,
);
