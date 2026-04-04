import { roleAttributes } from '@serializers/attributes/collections/role.attributes';
import { memberAttributes } from '@serializers/attributes/organizations/member.attributes';
import { rel } from '@serializers/builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const memberSerializerConfig = {
  attributes: memberAttributes,
  brands: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  role: rel('role', roleAttributes),
  type: 'member',
  user: USER_REL,
};
