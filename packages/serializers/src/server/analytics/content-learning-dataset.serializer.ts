import { buildSerializer } from '@serializers/builders';
import { contentLearningDatasetSerializerConfig } from '@serializers/configs/analytics/content-learning-dataset.config';
export const { ContentLearningDatasetSerializer } = buildSerializer(
  'server',
  contentLearningDatasetSerializerConfig,
);
