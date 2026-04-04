import { darkroomFleetHealthAttributes } from '@serializers/attributes/admin/darkroom-fleet-health.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomFleetHealthSerializerConfig = simpleConfig(
  'darkroom-fleet-health',
  darkroomFleetHealthAttributes,
);
