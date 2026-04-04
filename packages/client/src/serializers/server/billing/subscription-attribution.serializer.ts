import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { subscriptionAttributionSerializerConfig } from '../../configs';

export const SubscriptionAttributionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  subscriptionAttributionSerializerConfig,
);
