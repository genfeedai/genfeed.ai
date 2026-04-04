import {
  type BuiltSerializer,
  buildSingleSerializer,
  subscriptionPreviewSerializerConfig,
  subscriptionSerializerConfig,
} from '..';

// Build all billing serializers
export const SubscriptionPreviewSerializer: BuiltSerializer =
  buildSingleSerializer('client', subscriptionPreviewSerializerConfig);
export const SubscriptionSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  subscriptionSerializerConfig,
);
