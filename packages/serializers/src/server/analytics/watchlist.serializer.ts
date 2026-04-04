import { buildSerializer } from '@serializers/builders';
import { watchlistSerializerConfig } from '@serializers/configs';

export const { WatchlistSerializer } = buildSerializer(
  'server',
  watchlistSerializerConfig,
);
