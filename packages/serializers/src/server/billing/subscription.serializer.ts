import { buildSerializer } from '@serializers/builders';
import {
  subscriptionPreviewSerializerConfig,
  subscriptionSerializerConfig,
} from '@serializers/configs';

export const { SubscriptionPreviewSerializer } = buildSerializer(
  'server',
  subscriptionPreviewSerializerConfig,
);

export const { SubscriptionSerializer } = buildSerializer(
  'server',
  subscriptionSerializerConfig,
);
