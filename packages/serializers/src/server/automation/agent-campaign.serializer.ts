import { buildSerializer } from '@serializers/builders';
import { agentCampaignSerializerConfig } from '@serializers/configs';

export const { AgentCampaignSerializer } = buildSerializer(
  'server',
  agentCampaignSerializerConfig,
);
