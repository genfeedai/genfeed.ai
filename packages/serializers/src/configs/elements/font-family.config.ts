import { fontFamilyAttributes } from '@serializers/attributes/elements/font-family.attributes';
import { simpleConfig } from '@serializers/builders';

export const fontFamilySerializerConfig = simpleConfig(
  'font-family',
  fontFamilyAttributes,
);
