import { buildSerializer } from '@serializers/builders';
import { fleetEc2BulkActionResultSerializerConfig } from '@serializers/configs';

export const { FleetEc2BulkActionResultSerializer } = buildSerializer(
  'server',
  fleetEc2BulkActionResultSerializerConfig,
);
