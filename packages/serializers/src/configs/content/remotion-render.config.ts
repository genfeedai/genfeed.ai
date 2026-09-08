import { remotionRenderAttributes } from '@serializers/attributes/content/remotion-render.attributes';
import { simpleConfig } from '@serializers/builders';
export const remotionRenderSerializerConfig = simpleConfig(
  'remotion-render',
  remotionRenderAttributes,
);
