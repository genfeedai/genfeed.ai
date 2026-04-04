import { elementStyleAttributes } from '@serializers/attributes/elements/style.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementStyleSerializerConfig = simpleConfig(
  'element-style',
  elementStyleAttributes,
);
