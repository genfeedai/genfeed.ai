import { buildSerializer } from '@serializers/builders';
import { clipperProjectSerializerConfig } from '@serializers/configs';

export const { ClipperProjectSerializer } = buildSerializer(
  'server',
  clipperProjectSerializerConfig,
);
