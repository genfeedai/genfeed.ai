import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { agentCampaignSerializerConfig } from '../../configs';

export const AgentCampaignSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  agentCampaignSerializerConfig,
);
