import { brandOsRevisionAttributes } from '@serializers/attributes/organizations/brand-os-revision.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandOsRevisionSerializerConfig = simpleConfig(
  'brand-os-revision',
  brandOsRevisionAttributes,
);
