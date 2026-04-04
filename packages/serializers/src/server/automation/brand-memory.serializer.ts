import { buildSerializer } from '@serializers/builders';
import { brandMemorySerializerConfig } from '@serializers/configs';

export const { BrandMemorySerializer } = buildSerializer(
  'server',
  brandMemorySerializerConfig,
);
