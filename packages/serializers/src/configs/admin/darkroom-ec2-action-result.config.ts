import { darkroomEc2ActionResultAttributes } from '@serializers/attributes/admin/darkroom-ec2-action-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomEc2ActionResultSerializerConfig = simpleConfig(
  'darkroom-ec2-action-result',
  darkroomEc2ActionResultAttributes,
);
