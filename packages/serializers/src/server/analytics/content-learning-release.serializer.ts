import { buildSerializer } from '@serializers/builders';
import { contentLearningReleaseSerializerConfig } from '@serializers/configs/analytics/content-learning-release.config';
export const { ContentLearningReleaseSerializer } = buildSerializer(
  'server',
  contentLearningReleaseSerializerConfig,
);
