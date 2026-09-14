import { buildSerializer } from '@serializers/builders';
import { brandOsExportSerializerConfig } from '@serializers/configs/organizations/brand-os-export.config';
export const { BrandOsExportSerializer } = buildSerializer(
  'server',
  brandOsExportSerializerConfig,
);
