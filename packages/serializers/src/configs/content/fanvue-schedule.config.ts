import { fanvueScheduleAttributes } from '@serializers/attributes/content/fanvue-schedule.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '@serializers/relationships';

export const fanvueScheduleSerializerConfig = {
  attributes: fanvueScheduleAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'fanvue-schedule',
  user: USER_REL,
};
