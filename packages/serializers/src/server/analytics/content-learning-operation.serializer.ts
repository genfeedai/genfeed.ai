import { buildSerializer } from '@serializers/builders';
import { contentLearningOperationSerializerConfig } from '@serializers/configs/analytics/content-learning-operation.config';
export const { ContentLearningOperationSerializer } = buildSerializer(
  'server',
  contentLearningOperationSerializerConfig,
);
