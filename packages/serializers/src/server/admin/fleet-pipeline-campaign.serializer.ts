import { buildSerializer } from '@serializers/builders';
import { fleetPipelineCampaignSerializerConfig } from '@serializers/configs';

export const { FleetPipelineCampaignSerializer } = buildSerializer(
  'server',
  fleetPipelineCampaignSerializerConfig,
);
