import { leadAttributes } from '@serializers/attributes/management/lead.attributes';
import {
  BRAND_REL,
  ORGANIZATION_REL,
  USER_REL,
} from '@serializers/relationships';

export const leadSerializerConfig = {
  attributes: leadAttributes,
  organization: ORGANIZATION_REL,
  proactiveBrand: BRAND_REL,
  proactiveOrganization: ORGANIZATION_REL,
  type: 'lead',
  user: USER_REL,
};
