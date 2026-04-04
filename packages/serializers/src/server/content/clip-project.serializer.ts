import { buildSerializer } from '@serializers/builders';
import { clipProjectSerializerConfig } from '@serializers/configs';

export const { ClipProjectSerializer } = buildSerializer(
  'server',
  clipProjectSerializerConfig,
);
