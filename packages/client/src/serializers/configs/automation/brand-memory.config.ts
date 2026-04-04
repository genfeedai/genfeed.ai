import { brandMemoryAttributes } from '../../attributes/automation/brand-memory.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '../../relationships';

export const brandMemorySerializerConfig = {
  attributes: brandMemoryAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'brand-memory',
};
