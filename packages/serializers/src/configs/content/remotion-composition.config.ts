import { remotionCompositionAttributes } from '@serializers/attributes/content/remotion-composition.attributes';
import { simpleConfig } from '@serializers/builders';
export const remotionCompositionSerializerConfig = simpleConfig(
  'remotion-composition',
  remotionCompositionAttributes,
);
