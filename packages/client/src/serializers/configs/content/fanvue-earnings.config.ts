import { fanvueEarningsAttributes } from '../../attributes/content/fanvue-earnings.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const fanvueEarningsSerializerConfig = {
  attributes: fanvueEarningsAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-earnings',
  user: USER_REL,
};
