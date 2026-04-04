import { buildSerializer } from '@serializers/builders';
import { brandSerializerConfig } from '@serializers/configs';

export const { BrandSerializer } = buildSerializer(
  'server',
  brandSerializerConfig,
);
