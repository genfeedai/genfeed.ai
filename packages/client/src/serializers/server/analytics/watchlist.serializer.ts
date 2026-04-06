import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { watchlistSerializerConfig } from '../../configs';

export const WatchlistSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  watchlistSerializerConfig,
);
