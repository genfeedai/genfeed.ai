import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { batchSerializerConfig } from '../../configs';

export const BatchSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  batchSerializerConfig,
);
