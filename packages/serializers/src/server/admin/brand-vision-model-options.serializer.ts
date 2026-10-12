import { buildSerializer } from '@serializers/builders';
import { brandVisionModelOptionsSerializerConfig } from '@serializers/configs';

export const { BrandVisionModelOptionsSerializer } = buildSerializer(
  'server',
  brandVisionModelOptionsSerializerConfig,
);
