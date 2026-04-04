import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { optimizationSerializerConfig } from '../../configs';

export const OptimizationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  optimizationSerializerConfig,
);
