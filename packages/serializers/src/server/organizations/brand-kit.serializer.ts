import { buildSerializer } from '@serializers/builders';
import {
  brandKitApplySerializerConfig,
  brandKitAssetImportSerializerConfig,
  brandKitSerializerConfig,
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
