import { campaignPerformanceAttributes } from '@serializers/attributes/content/campaign-performance.attributes';
import { simpleConfig } from '@serializers/builders';

export const campaignPerformanceSerializerConfig = simpleConfig(
  'campaign-performance',
  campaignPerformanceAttributes,
);
