import { fleetEc2InstanceAttributes } from '@serializers/attributes/admin/fleet-ec2-instance.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetEc2InstanceSerializerConfig = simpleConfig(
  'fleet-ec2-instance',
  fleetEc2InstanceAttributes,
);
