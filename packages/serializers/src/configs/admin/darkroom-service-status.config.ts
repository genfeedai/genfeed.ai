import { darkroomServiceStatusAttributes } from '@serializers/attributes/admin/darkroom-service-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomServiceStatusSerializerConfig = simpleConfig(
  'darkroom-service-status',
  darkroomServiceStatusAttributes,
);
