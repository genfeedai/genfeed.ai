import { buildSerializer } from '@serializers/builders';
import { contentLearningExperimentSerializerConfig } from '@serializers/configs/analytics/content-learning-experiment.config';
export const { ContentLearningExperimentSerializer } = buildSerializer(
  'server',
  contentLearningExperimentSerializerConfig,
);
