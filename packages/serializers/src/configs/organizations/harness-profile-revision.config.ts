import { harnessProfileRevisionAttributes } from '@serializers/attributes/organizations/harness-profile-revision.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const harnessProfileRevisionSerializerConfig = {
  attributes: harnessProfileRevisionAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'harness-profile-revision',
};
