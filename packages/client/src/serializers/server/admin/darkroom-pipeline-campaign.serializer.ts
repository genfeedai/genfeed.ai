import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomPipelineCampaignSerializerConfig } from '../../configs';

export const DarkroomPipelineCampaignSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomPipelineCampaignSerializerConfig);
