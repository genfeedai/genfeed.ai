import { buildSerializer } from '@serializers/builders';
import { subscriptionAttributionSerializerConfig } from '@serializers/configs';

export const { SubscriptionAttributionSerializer } = buildSerializer(
  'server',
  subscriptionAttributionSerializerConfig,
);
