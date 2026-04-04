import { campaignAttributes } from '../../attributes/automation/campaign.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

export const campaignSerializerConfig = {
  attributes: campaignAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'campaign',
  user: USER_REL,
};
