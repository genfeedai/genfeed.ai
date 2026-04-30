import { harnessProfileAttributes } from '@serializers/attributes/organizations/harness-profile.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const harnessProfileSerializerConfig = {
  attributes: harnessProfileAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'harness-profile',
};
