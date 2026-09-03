import { campaignComparisonAttributes } from '@serializers/attributes/content/campaign-comparison.attributes';
import { simpleConfig } from '@serializers/builders';

export const campaignComparisonSerializerConfig = simpleConfig(
  'campaign-comparison',
  campaignComparisonAttributes,
);
