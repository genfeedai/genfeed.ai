import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { marketplaceAnalyticsOverviewSerializerConfig } from '../../configs';

export const MarketplaceAnalyticsOverviewSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  marketplaceAnalyticsOverviewSerializerConfig,
);
