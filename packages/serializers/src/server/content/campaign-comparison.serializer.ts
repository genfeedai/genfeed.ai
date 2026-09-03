import { buildSerializer } from '@serializers/builders';
import { campaignComparisonSerializerConfig } from '@serializers/configs';

export const { CampaignComparisonSerializer } = buildSerializer(
  'server',
  campaignComparisonSerializerConfig,
);
