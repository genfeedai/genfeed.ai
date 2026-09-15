import { outlierPostPerformanceAttributes } from '@serializers/attributes/social/outlier-post-performance.attributes';
import { simpleConfig } from '@serializers/builders';
export const outlierPostPerformanceSerializerConfig = simpleConfig(
  'outlier-post-performance',
  outlierPostPerformanceAttributes,
);
