import { elementLightingAttributes } from '@serializers/attributes/elements/lighting.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementLightingSerializerConfig = simpleConfig(
  'element-lighting',
  elementLightingAttributes,
);
