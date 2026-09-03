import { buildSerializer } from '@serializers/builders';
import { campaignPerformanceSerializerConfig } from '@serializers/configs';

export const { CampaignPerformanceSerializer } = buildSerializer(
  'server',
  campaignPerformanceSerializerConfig,
);
