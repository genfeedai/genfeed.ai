import { fleetEc2ActionResultAttributes } from '@serializers/attributes/admin/fleet-ec2-action-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetEc2ActionResultSerializerConfig = simpleConfig(
  'fleet-ec2-action-result',
  fleetEc2ActionResultAttributes,
);
