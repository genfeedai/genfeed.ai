import { buildSerializer } from '@serializers/builders';
import { darkroomPipelineCampaignSerializerConfig } from '@serializers/configs';

export const { DarkroomPipelineCampaignSerializer } = buildSerializer(
  'server',
  darkroomPipelineCampaignSerializerConfig,
);
