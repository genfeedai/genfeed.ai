import { buildSerializer } from '@serializers/builders';
import { optimizationSerializerConfig } from '@serializers/configs';

export const { OptimizationSerializer } = buildSerializer(
  'server',
  optimizationSerializerConfig,
);
