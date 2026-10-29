import { buildSerializer, buildSingleSerializer } from '@serializers/builders';
import {
  brandSerializerConfig,
  publicBrandSerializerConfig,
} from '@serializers/configs';

export const { BrandSerializer } = buildSerializer(
  'server',
  brandSerializerConfig,
);

// `buildSerializer` keys its result by the config `type`, which both brand
// configs share, so the public serializer is built as a single serializer.
export const PublicBrandSerializer = buildSingleSerializer(
  'server',
  publicBrandSerializerConfig,
);
