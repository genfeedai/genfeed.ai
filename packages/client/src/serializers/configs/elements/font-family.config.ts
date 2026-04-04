import { fontFamilyAttributes } from '../../attributes/elements/font-family.attributes';
import { simpleConfig } from '../../builders';

export const fontFamilySerializerConfig = simpleConfig(
  'font-family',
  fontFamilyAttributes,
);
