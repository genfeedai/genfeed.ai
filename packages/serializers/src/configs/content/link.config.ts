import { linkAttributes } from '@serializers/attributes/content/link.attributes';
import { BRAND_REL } from '@serializers/relationships';

export const linkSerializerConfig = {
  attributes: linkAttributes,
  brand: BRAND_REL,
  type: 'link',
};
