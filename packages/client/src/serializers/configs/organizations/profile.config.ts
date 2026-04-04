import { profileAttributes } from '../../attributes/organizations/profile.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const profileSerializerConfig = {
  attributes: profileAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'profile',
};
