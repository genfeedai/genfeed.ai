import { buildSerializer } from '@serializers/builders';
import {
  brandMemoryInsightSerializerConfig,
  brandMemorySerializerConfig,
} from '@serializers/configs';

export const { BrandMemorySerializer } = buildSerializer(
  'server',
  brandMemorySerializerConfig,
);

export const { BrandMemoryInsightSerializer } = buildSerializer(
  'server',
  brandMemoryInsightSerializerConfig,
);
