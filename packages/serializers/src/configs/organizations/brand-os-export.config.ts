import { brandOsExportAttributes } from '@serializers/attributes/organizations/brand-os-export.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandOsExportSerializerConfig = simpleConfig(
  'brand-os-export',
  brandOsExportAttributes,
);
