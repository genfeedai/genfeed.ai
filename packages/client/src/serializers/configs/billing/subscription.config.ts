import {
  subscriptionAttributes,
  subscriptionPreviewAttributes,
} from '../../attributes/billing/subscription.attributes';
import { simpleConfig } from '../../builders';

export const subscriptionSerializerConfig = simpleConfig(
  'subscription',
  subscriptionAttributes,
);

export const subscriptionPreviewSerializerConfig = simpleConfig(
  'subscription-preview',
  subscriptionPreviewAttributes,
);
