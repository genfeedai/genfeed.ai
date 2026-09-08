import { buildSerializer } from '@serializers/builders';
import { remotionCompositionSerializerConfig } from '@serializers/configs';
export const { RemotionCompositionSerializer } = buildSerializer(
  'server',
  remotionCompositionSerializerConfig,
);
