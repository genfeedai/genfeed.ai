import { buildSerializer } from '@serializers/builders';
import { reviewInboxDecisionSerializerConfig } from '@serializers/configs/content/review-inbox-decision.config';

export const { ReviewInboxDecisionSerializer } = buildSerializer(
  'server',
  reviewInboxDecisionSerializerConfig,
);
