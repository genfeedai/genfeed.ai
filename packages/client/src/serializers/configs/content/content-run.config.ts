import { contentRunAttributes } from '../../attributes/content/content-run.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '../../relationships';

export const contentRunSerializerConfig = {
  attributes: contentRunAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'content-run',
};
