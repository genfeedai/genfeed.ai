import { buildSerializer } from '@serializers/builders';
import { adsDiscoverySerializerConfig } from '@serializers/configs/content/ads-discovery.config';
export const { AdsDiscoverySerializer } = buildSerializer(
  'server',
  adsDiscoverySerializerConfig,
);
