import { fleetHealthAttributes } from '@serializers/attributes/admin/fleet-health.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetHealthSerializerConfig = simpleConfig(
  'fleet-health',
  fleetHealthAttributes,
);
