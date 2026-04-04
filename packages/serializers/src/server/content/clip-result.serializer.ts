import { buildSerializer } from '@serializers/builders';
import { clipResultSerializerConfig } from '@serializers/configs';

export const { ClipResultSerializer } = buildSerializer(
  'server',
  clipResultSerializerConfig,
);
