import { buildSerializer } from '@serializers/builders';
import { clipperResultSerializerConfig } from '@serializers/configs';

export const { ClipperResultSerializer } = buildSerializer(
  'server',
  clipperResultSerializerConfig,
);
