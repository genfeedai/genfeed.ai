import { darkroomFleetHealthAttributes } from '../../attributes/admin/darkroom-fleet-health.attributes';
import { simpleConfig } from '../../builders';

export const darkroomFleetHealthSerializerConfig = simpleConfig(
  'darkroom-fleet-health',
  darkroomFleetHealthAttributes,
);
