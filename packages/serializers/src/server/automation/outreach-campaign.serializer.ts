import { buildSerializer } from '@serializers/builders';
import { outreachCampaignSerializerConfig } from '@serializers/configs';

export const { OutreachCampaignSerializer } = buildSerializer(
  'server',
  outreachCampaignSerializerConfig,
);
