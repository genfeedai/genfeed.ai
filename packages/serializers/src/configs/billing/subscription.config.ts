import {
  subscriptionAttributes,
  subscriptionPreviewAttributes,
} from '@serializers/attributes/billing/subscription.attributes';
import { simpleConfig } from '@serializers/builders';

export const subscriptionSerializerConfig = simpleConfig(
  'subscription',
  subscriptionAttributes,
);

export const subscriptionPreviewSerializerConfig = simpleConfig(
  'subscription-preview',
  subscriptionPreviewAttributes,
);
