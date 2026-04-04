import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { brandMemorySerializerConfig } from '../../configs';

export const BrandMemorySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  brandMemorySerializerConfig,
);
