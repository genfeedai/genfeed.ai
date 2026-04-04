import { buildSerializer } from '@serializers/builders';
import { trainingSerializerConfig } from '@serializers/configs';

export const { TrainingSerializer } = buildSerializer(
  'server',
  trainingSerializerConfig,
);
