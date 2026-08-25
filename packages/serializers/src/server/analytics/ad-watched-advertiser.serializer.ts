import { buildSerializer } from '@serializers/builders';
import { adWatchedAdvertiserSerializerConfig } from '@serializers/configs';

export const { AdWatchedAdvertiserSerializer } = buildSerializer(
  'server',
  adWatchedAdvertiserSerializerConfig,
);
