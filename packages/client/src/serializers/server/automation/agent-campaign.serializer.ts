import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { agentCampaignSerializerConfig } from '../../configs';

export const AgentCampaignSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentCampaignSerializerConfig,
);
