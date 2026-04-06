import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { subscriptionAttributionSerializerConfig } from '../../configs';

export const SubscriptionAttributionSerializer: BuiltSerializer =
  buildSingleSerializer('server', subscriptionAttributionSerializerConfig);
