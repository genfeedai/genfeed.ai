import { buildSerializer } from '@serializers/builders';
import { brandRemixRunSummarySerializerConfig } from '@serializers/configs';

export const { BrandRemixRunSummarySerializer } = buildSerializer(
  'server',
  brandRemixRunSummarySerializerConfig,
);
