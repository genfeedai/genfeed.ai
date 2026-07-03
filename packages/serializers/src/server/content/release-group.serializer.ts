import { buildSerializer } from '@serializers/builders';
import { releaseGroupSerializerConfig } from '@serializers/configs';

export const { ReleaseGroupSerializer } = buildSerializer(
  'server',
  releaseGroupSerializerConfig,
);
