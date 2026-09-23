import { adsDiscoveryAttributes } from '@serializers/attributes/content/ads-discovery.attributes';
import { simpleConfig } from '@serializers/builders';
export const adsDiscoverySerializerConfig = simpleConfig(
  'ads-discovery',
  adsDiscoveryAttributes,
);
