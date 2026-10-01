import { buildSerializer } from '@serializers/builders';
import { contentLearningRunSerializerConfig } from '@serializers/configs/analytics/content-learning-run.config';
export const { ContentLearningRunSerializer } = buildSerializer(
  'server',
  contentLearningRunSerializerConfig,
);
