import { buildSerializer } from '@serializers/builders';
import { outlierPostPerformanceSerializerConfig } from '@serializers/configs/social/outlier-post-performance.config';
export const { OutlierPostPerformanceSerializer } = buildSerializer(
  'server',
  outlierPostPerformanceSerializerConfig,
);
