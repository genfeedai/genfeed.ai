import {
  brandKitApplyAttributes,
  brandKitAssetImportAttributes,
  brandKitAttributes,
} from '@serializers/attributes/organizations/brand-kit.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandKitSerializerConfig = simpleConfig(
  'brand-kit',
  brandKitAttributes,
);

export const brandKitApplySerializerConfig = simpleConfig(
  'brand-kit-apply',
  brandKitApplyAttributes,
);

export const brandKitAssetImportSerializerConfig = simpleConfig(
  'brand-kit-asset-import',
  brandKitAssetImportAttributes,
);
