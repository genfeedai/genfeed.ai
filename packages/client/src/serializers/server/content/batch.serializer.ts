import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { batchSerializerConfig } from '../../configs';

export const BatchSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  batchSerializerConfig,
);
