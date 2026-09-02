import { buildSerializer } from '@serializers/builders';
import { campaignLifecycleSerializerConfig } from '@serializers/configs';

export const { CampaignLifecycleSerializer } = buildSerializer(
  'server',
  campaignLifecycleSerializerConfig,
);
