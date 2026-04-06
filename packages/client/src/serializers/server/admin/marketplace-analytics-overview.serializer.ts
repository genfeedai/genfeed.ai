import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { marketplaceAnalyticsOverviewSerializerConfig } from '../../configs';

export const MarketplaceAnalyticsOverviewSerializer: BuiltSerializer =
  buildSingleSerializer('server', marketplaceAnalyticsOverviewSerializerConfig);
