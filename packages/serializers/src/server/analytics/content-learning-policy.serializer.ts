import { buildSerializer } from '@serializers/builders';
import { contentLearningPolicySerializerConfig } from '@serializers/configs/analytics/content-learning-policy.config';
export const { ContentLearningPolicySerializer } = buildSerializer(
  'server',
  contentLearningPolicySerializerConfig,
);
