import { elementStyleAttributes } from '../../attributes/elements/style.attributes';
import { simpleConfig } from '../../builders';

export const elementStyleSerializerConfig = simpleConfig(
  'element-style',
  elementStyleAttributes,
);
