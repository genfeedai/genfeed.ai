import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomPipelineCampaignSerializerConfig } from '../../configs';

export const DarkroomPipelineCampaignSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomPipelineCampaignSerializerConfig,
);
