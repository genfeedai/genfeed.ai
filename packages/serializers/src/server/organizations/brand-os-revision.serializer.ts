import { buildSerializer } from '@serializers/builders';
import { brandOsRevisionSerializerConfig } from '@serializers/configs/organizations/brand-os-revision.config';

export const { BrandOsRevisionSerializer } = buildSerializer(
  'server',
  brandOsRevisionSerializerConfig,
);
