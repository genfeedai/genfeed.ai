import { buildSerializer } from '@serializers/builders';
import { mediaPerceptionSerializerConfig } from '@serializers/configs';

export const { MediaPerceptionSerializer } = buildSerializer(
  'server',
  mediaPerceptionSerializerConfig,
);
