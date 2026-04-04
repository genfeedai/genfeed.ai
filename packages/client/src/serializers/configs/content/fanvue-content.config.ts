import { fanvueContentAttributes } from '../../attributes/content/fanvue-content.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const fanvueContentSerializerConfig = {
  attributes: fanvueContentAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-content',
  user: USER_REL,
};
