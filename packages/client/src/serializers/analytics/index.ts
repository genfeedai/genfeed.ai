import {
  type BuiltSerializer,
  buildSingleSerializer,
  evaluationSerializerConfig,
  watchlistSerializerConfig,
} from '..';

// Build all analytics serializers
export const EvaluationSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  evaluationSerializerConfig,
);
export const WatchlistSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  watchlistSerializerConfig,
);
