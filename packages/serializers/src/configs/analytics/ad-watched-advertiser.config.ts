import { adWatchedAdvertiserAttributes } from '@serializers/attributes/analytics/ad-watched-advertiser.attributes';
import { simpleConfig } from '@serializers/builders';

export const adWatchedAdvertiserSerializerConfig = simpleConfig(
  'ad-watched-advertiser',
  adWatchedAdvertiserAttributes,
);
