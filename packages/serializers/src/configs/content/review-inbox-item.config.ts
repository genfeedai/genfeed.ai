import { reviewInboxItemAttributes } from '@serializers/attributes/content/review-inbox-item.attributes';
import { simpleConfig } from '@serializers/builders';

export const reviewInboxItemSerializerConfig = simpleConfig(
  'review-inbox-item',
  reviewInboxItemAttributes,
);
