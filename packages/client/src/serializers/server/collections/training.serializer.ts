import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { trainingSerializerConfig } from '../../configs';

export const TrainingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  trainingSerializerConfig,
);
