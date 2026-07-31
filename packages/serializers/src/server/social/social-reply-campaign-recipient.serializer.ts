import { buildSerializer } from '@serializers/builders';
import { socialReplyCampaignRecipientSerializerConfig } from '@serializers/configs';

export const { SocialReplyCampaignRecipientSerializer } = buildSerializer(
  'server',
  socialReplyCampaignRecipientSerializerConfig,
);
