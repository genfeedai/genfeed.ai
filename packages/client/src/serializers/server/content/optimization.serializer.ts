import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { optimizationSerializerConfig } from '../../configs';

export const OptimizationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  optimizationSerializerConfig,
);
