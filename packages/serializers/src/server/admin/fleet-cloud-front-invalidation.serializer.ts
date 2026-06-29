import { buildSerializer } from '@serializers/builders';
import { fleetCloudFrontInvalidationSerializerConfig } from '@serializers/configs';

export const { FleetCloudFrontInvalidationSerializer } = buildSerializer(
  'server',
  fleetCloudFrontInvalidationSerializerConfig,
);
