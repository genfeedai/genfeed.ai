import { darkroomPipelineCampaignAttributes } from '../../attributes/admin/darkroom-pipeline-campaign.attributes';
import { simpleConfig } from '../../builders';

export const darkroomPipelineCampaignSerializerConfig = simpleConfig(
  'darkroom-pipeline-campaign',
  darkroomPipelineCampaignAttributes,
);
