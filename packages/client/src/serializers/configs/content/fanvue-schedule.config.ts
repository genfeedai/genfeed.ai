import { fanvueScheduleAttributes } from '../../attributes/content/fanvue-schedule.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const fanvueScheduleSerializerConfig = {
  attributes: fanvueScheduleAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-schedule',
  user: USER_REL,
};
