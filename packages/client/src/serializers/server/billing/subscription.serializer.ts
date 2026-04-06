import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import {
  subscriptionPreviewSerializerConfig,
  subscriptionSerializerConfig,
} from '../../configs';

export const SubscriptionPreviewSerializer: BuiltSerializer =
  buildSingleSerializer('server', subscriptionPreviewSerializerConfig);

export const SubscriptionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  subscriptionSerializerConfig,
);
