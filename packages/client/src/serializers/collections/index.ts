import {
  type BuiltSerializer,
  buildSingleSerializer,
  modelSerializerConfig,
  roleSerializerConfig,
  trainingSerializerConfig,
  trendSerializerConfig,
  voteSerializerConfig,
} from '..';

// Build all collection serializers
export const ModelSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  modelSerializerConfig,
);
export const RoleSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  roleSerializerConfig,
);
export const TrainingSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  trainingSerializerConfig,
);
export const TrendSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  trendSerializerConfig,
);
export const VoteSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  voteSerializerConfig,
);
