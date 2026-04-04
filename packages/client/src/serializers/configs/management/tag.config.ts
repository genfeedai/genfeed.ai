import { tagAttributes } from '../../attributes/management/tag.attributes';
import {
  BRAND_REL,
  ORGANIZATION_REL,
  USER_REL,
} from '../../relationships';

export const tagSerializerConfig = {
  attributes: tagAttributes,
  brand: BRAND_REL,
  organization: ORGANIZATION_REL,
  type: 'tag',
  user: USER_REL,
};
