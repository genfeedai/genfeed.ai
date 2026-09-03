import { buildSerializer } from '@serializers/builders';
import { campaignPaidActivationSerializerConfig } from '@serializers/configs';

export const { CampaignPaidActivationSerializer } = buildSerializer(
  'server',
  campaignPaidActivationSerializerConfig,
);
