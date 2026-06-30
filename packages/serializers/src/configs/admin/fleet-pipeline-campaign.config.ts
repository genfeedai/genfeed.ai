import { fleetPipelineCampaignAttributes } from '@serializers/attributes/admin/fleet-pipeline-campaign.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetPipelineCampaignSerializerConfig = simpleConfig(
  'fleet-pipeline-campaign',
  fleetPipelineCampaignAttributes,
);
