import { darkroomEc2InstanceAttributes } from '../../attributes/admin/darkroom-ec2-instance.attributes';
import { simpleConfig } from '../../builders';

export const darkroomEc2InstanceSerializerConfig = simpleConfig(
  'darkroom-ec2-instance',
  darkroomEc2InstanceAttributes,
);
