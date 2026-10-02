import { buildSerializer } from '@serializers/builders';
import { brandFontAssetSerializerConfig } from '@serializers/configs/organizations/brand-font-asset.config';
export const { BrandFontAssetSerializer } = buildSerializer(
  'server',
  brandFontAssetSerializerConfig,
);
