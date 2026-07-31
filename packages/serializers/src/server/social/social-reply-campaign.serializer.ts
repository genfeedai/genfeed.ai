import { buildSerializer } from '@serializers/builders';
import { socialReplyCampaignSerializerConfig } from '@serializers/configs';

export const { SocialReplyCampaignSerializer } = buildSerializer(
  'server',
  socialReplyCampaignSerializerConfig,
);
