import { brandRelocationAttributes } from '@serializers/attributes/organizations/brand-relocation.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandRelocationSerializerConfig = simpleConfig(
  'brand-relocation',
  brandRelocationAttributes,
);
