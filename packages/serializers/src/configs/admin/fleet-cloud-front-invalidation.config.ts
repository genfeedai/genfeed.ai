import { fleetCloudFrontInvalidationAttributes } from '@serializers/attributes/admin/fleet-cloud-front-invalidation.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetCloudFrontInvalidationSerializerConfig = simpleConfig(
  'fleet-cloud-front-invalidation',
  fleetCloudFrontInvalidationAttributes,
);
