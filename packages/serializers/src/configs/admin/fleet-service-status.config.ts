import { fleetServiceStatusAttributes } from '@serializers/attributes/admin/fleet-service-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetServiceStatusSerializerConfig = simpleConfig(
  'fleet-service-status',
  fleetServiceStatusAttributes,
);
