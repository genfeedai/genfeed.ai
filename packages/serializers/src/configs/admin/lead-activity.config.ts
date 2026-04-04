import { leadActivityAttributes } from '@serializers/attributes/admin/lead-activity.attributes';
import { simpleConfig } from '@serializers/builders';

export const leadActivitySerializerConfig = simpleConfig(
  'lead-activity',
  leadActivityAttributes,
);
