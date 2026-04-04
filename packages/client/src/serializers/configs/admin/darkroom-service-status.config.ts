import { darkroomServiceStatusAttributes } from '../../attributes/admin/darkroom-service-status.attributes';
import { simpleConfig } from '../../builders';

export const darkroomServiceStatusSerializerConfig = simpleConfig(
  'darkroom-service-status',
  darkroomServiceStatusAttributes,
);
