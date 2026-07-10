import { buildSerializer } from '@serializers/builders';
import { sourcePostSerializerConfig } from '@serializers/configs';

export const { SourcePostSerializer } = buildSerializer(
  'server',
  sourcePostSerializerConfig,
);
