import { buildSerializer } from '@serializers/builders';
import {
  brandKitApplySerializerConfig,
  brandKitAssetImportSerializerConfig,
  brandKitSerializerConfig,
  brandOsDraftHandoffSerializerConfig,
  brandOsPreviewSerializerConfig,
} from '@serializers/configs/organizations/brand-kit.config';

export const { BrandKitSerializer } = buildSerializer(
  'server',
  brandKitSerializerConfig,
);

export const { BrandKitApplySerializer } = buildSerializer(
  'server',
  brandKitApplySerializerConfig,
);

export const { BrandKitAssetImportSerializer } = buildSerializer(
  'server',
  brandKitAssetImportSerializerConfig,
);

export const { BrandOsPreviewSerializer } = buildSerializer(
  'server',
  brandOsPreviewSerializerConfig,
);

export const { BrandOsDraftHandoffSerializer } = buildSerializer(
  'server',
  brandOsDraftHandoffSerializerConfig,
);
