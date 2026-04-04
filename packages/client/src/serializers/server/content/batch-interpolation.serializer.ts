import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { batchInterpolationSerializerConfig } from '../../configs';

export const BatchInterpolationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  batchInterpolationSerializerConfig,
);
