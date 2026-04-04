import { leadActivityAttributes } from '../../attributes/admin/lead-activity.attributes';
import { simpleConfig } from '../../builders';

export const leadActivitySerializerConfig = simpleConfig(
  'lead-activity',
  leadActivityAttributes,
);
