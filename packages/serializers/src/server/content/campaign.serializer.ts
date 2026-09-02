import { buildSerializer } from '@serializers/builders';
import { campaignSerializerConfig } from '@serializers/configs';

export const { CampaignSerializer } = buildSerializer(
  'server',
  campaignSerializerConfig,
);
