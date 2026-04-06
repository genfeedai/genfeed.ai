import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { brandMemorySerializerConfig } from '../../configs';

export const BrandMemorySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  brandMemorySerializerConfig,
);
