import { buildSerializer } from '@serializers/builders';
import { mediaModerationSerializerConfig } from '@serializers/configs';

export const { MediaModerationSerializer } = buildSerializer(
  'server',
  mediaModerationSerializerConfig,
);
