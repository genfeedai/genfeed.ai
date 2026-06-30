import { fleetEc2BulkActionResultAttributes } from '@serializers/attributes/admin/fleet-ec2-bulk-action-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetEc2BulkActionResultSerializerConfig = simpleConfig(
  'fleet-ec2-bulk-action-result',
  fleetEc2BulkActionResultAttributes,
);
