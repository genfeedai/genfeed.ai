import { xAdWatchedAdvertiserAttributes } from '@serializers/attributes/analytics/x-ad-watched-advertiser.attributes';
import { simpleConfig } from '@serializers/builders';

export const xAdWatchedAdvertiserSerializerConfig = simpleConfig(
  'x-ad-watched-advertiser',
  xAdWatchedAdvertiserAttributes,
);
