import { darkroomEc2InstanceAttributes } from '@serializers/attributes/admin/darkroom-ec2-instance.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomEc2InstanceSerializerConfig = simpleConfig(
  'darkroom-ec2-instance',
  darkroomEc2InstanceAttributes,
);
