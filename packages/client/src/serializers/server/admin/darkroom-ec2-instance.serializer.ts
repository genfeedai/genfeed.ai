import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomEc2InstanceSerializerConfig } from '../../configs';

export const DarkroomEc2InstanceSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomEc2InstanceSerializerConfig);
