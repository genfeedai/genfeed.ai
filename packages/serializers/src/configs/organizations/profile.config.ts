import { profileAttributes } from '@serializers/attributes/organizations/profile.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const profileSerializerConfig = {
  attributes: profileAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'profile',
};
