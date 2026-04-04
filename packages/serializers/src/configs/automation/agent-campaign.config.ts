import { agentCampaignAttributes } from '@serializers/attributes/automation/agent-campaign.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const agentCampaignSerializerConfig = {
  attributes: agentCampaignAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'agent-campaign',
  user: USER_REL,
};
