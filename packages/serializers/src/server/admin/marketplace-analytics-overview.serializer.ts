import { buildSerializer } from '@serializers/builders';
import { marketplaceAnalyticsOverviewSerializerConfig } from '@serializers/configs';

export const { MarketplaceAnalyticsOverviewSerializer } = buildSerializer(
  'server',
  marketplaceAnalyticsOverviewSerializerConfig,
);
