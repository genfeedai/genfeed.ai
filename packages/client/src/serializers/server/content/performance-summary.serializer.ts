import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { performanceSummarySerializerConfig } from '../../configs';

export const PerformanceSummarySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  performanceSummarySerializerConfig,
);
