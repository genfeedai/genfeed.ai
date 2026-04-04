import { outreachCampaignAttributes } from '@serializers/attributes/automation/outreach-campaign.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const outreachCampaignSerializerConfig = {
  attributes: outreachCampaignAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'outreach-campaign',
  user: USER_REL,
};
