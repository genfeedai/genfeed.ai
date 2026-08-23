import { buildSerializer } from '@serializers/builders';
import { xAdWatchedAdvertiserSerializerConfig } from '@serializers/configs';

export const { XAdWatchedAdvertiserSerializer } = buildSerializer(
  'server',
  xAdWatchedAdvertiserSerializerConfig,
);
