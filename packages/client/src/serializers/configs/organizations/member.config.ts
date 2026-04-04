import { roleAttributes } from '../../attributes/collections/role.attributes';
import { memberAttributes } from '../../attributes/organizations/member.attributes';
import { rel } from '../../builders';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

export const memberSerializerConfig = {
  attributes: memberAttributes,
  brands: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  role: rel('role', roleAttributes),
  type: 'member',
  user: USER_REL,
};
