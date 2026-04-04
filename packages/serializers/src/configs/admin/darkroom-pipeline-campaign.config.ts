import { darkroomPipelineCampaignAttributes } from '@serializers/attributes/admin/darkroom-pipeline-campaign.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomPipelineCampaignSerializerConfig = simpleConfig(
  'darkroom-pipeline-campaign',
  darkroomPipelineCampaignAttributes,
);
