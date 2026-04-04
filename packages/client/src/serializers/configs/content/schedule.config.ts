import { scheduleAttributes } from '../../attributes/content/schedule.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

export const scheduleSerializerConfig = {
  attributes: scheduleAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'schedule',
  user: USER_REL,
};
