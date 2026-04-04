import { marketplaceAnalyticsOverviewAttributes } from '@serializers/attributes/admin/marketplace-analytics-overview.attributes';
import { simpleConfig } from '@serializers/builders';

export const marketplaceAnalyticsOverviewSerializerConfig = simpleConfig(
  'marketplace-analytics-overview',
  marketplaceAnalyticsOverviewAttributes,
);
