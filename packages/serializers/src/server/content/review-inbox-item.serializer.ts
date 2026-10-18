import { buildSerializer } from '@serializers/builders';
import { reviewInboxItemSerializerConfig } from '@serializers/configs/content/review-inbox-item.config';

export const { ReviewInboxItemSerializer } = buildSerializer(
  'server',
  reviewInboxItemSerializerConfig,
);
