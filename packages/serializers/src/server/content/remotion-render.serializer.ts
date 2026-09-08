import { buildSerializer } from '@serializers/builders';
import { remotionRenderSerializerConfig } from '@serializers/configs';
export const { RemotionRenderSerializer } = buildSerializer(
  'server',
  remotionRenderSerializerConfig,
);
