import { reviewInboxDecisionAttributes } from '@serializers/attributes/content/review-inbox-decision.attributes';
import { simpleConfig } from '@serializers/builders';

export const reviewInboxDecisionSerializerConfig = simpleConfig(
  'review-inbox-decision',
  reviewInboxDecisionAttributes,
);
