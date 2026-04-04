import { contentScheduleAttributes } from '../../attributes/content/content-schedule.attributes';
import {
  BRAND_MINIMAL_REL,
  ORGANIZATION_MINIMAL_REL,
} from '../../relationships';

export const contentScheduleSerializerConfig = {
  attributes: contentScheduleAttributes,
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'content-schedule',
};
