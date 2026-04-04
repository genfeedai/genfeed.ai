import { buildSerializer } from '@serializers/builders';
import { contentPerformanceSerializerConfig } from '@serializers/configs';

export const { ContentPerformanceSerializer } = buildSerializer(
  'server',
  contentPerformanceSerializerConfig,
);
