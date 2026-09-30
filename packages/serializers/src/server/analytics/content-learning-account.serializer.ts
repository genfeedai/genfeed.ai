import { buildSerializer } from '@serializers/builders';
import { contentLearningAccountSerializerConfig } from '@serializers/configs/analytics/content-learning-account.config';
export const { ContentLearningAccountSerializer } = buildSerializer(
  'server',
  contentLearningAccountSerializerConfig,
);
