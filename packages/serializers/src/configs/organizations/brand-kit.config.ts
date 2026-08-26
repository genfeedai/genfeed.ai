import {
  brandKitApplyAttributes,
  brandKitAssetImportAttributes,
  brandKitAttributes,
  brandOsDraftHandoffAttributes,
  brandOsPreviewAttributes,
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

export const brandOsPreviewSerializerConfig = simpleConfig(
  'brand-os-preview',
  brandOsPreviewAttributes,
);

export const brandOsDraftHandoffSerializerConfig = simpleConfig(
  'brand-os-draft-handoff',
  brandOsDraftHandoffAttributes,
);
