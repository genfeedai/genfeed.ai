import { campaignAttributes } from '@serializers/attributes/content/campaign.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const campaignSerializerConfig = {
  attributes: campaignAttributes,
  type: 'campaign',
  ...STANDARD_ENTITY_RELS,
};
