import { buildSerializer } from '@serializers/builders';
import { contentLearningEvidenceSerializerConfig } from '@serializers/configs/analytics/content-learning-evidence.config';
export const { ContentLearningEvidenceSerializer } = buildSerializer(
  'server',
  contentLearningEvidenceSerializerConfig,
);
