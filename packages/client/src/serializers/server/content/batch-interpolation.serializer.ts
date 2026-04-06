import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { batchInterpolationSerializerConfig } from '../../configs';

export const BatchInterpolationSerializer: BuiltSerializer =
  buildSingleSerializer('server', batchInterpolationSerializerConfig);
