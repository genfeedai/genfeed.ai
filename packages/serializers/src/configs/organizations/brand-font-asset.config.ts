import {
  brandFontAssetAttributes,
  fontAssetBrandId,
  fontAssetContentHash,
} from '@serializers/attributes/organizations/brand-font-asset.attributes';
export const brandFontAssetSerializerConfig = {
  type: 'brand-font-asset',
  attributes: brandFontAssetAttributes,
  attributeDerivations: {
    brandId: fontAssetBrandId,
    contentHash: fontAssetContentHash,
  },
};
