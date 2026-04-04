import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentPerformanceSerializerConfig } from '../../configs';

export const ContentPerformanceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentPerformanceSerializerConfig,
);
