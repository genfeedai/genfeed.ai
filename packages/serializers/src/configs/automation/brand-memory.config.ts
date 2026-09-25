import {
  brandMemoryAttributes,
  brandMemoryInsightAttributes,
} from '@serializers/attributes/automation/brand-memory.attributes';
import { simpleConfig } from '@serializers/builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '@serializers/relationships';

export const brandMemorySerializerConfig = {
  attributes: brandMemoryAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'brand-memory',
};

export const brandMemoryInsightSerializerConfig = simpleConfig(
  'brand-memory-insight',
  brandMemoryInsightAttributes,
);
