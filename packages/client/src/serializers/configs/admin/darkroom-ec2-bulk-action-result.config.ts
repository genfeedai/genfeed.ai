import { darkroomEc2BulkActionResultAttributes } from '../../attributes/admin/darkroom-ec2-bulk-action-result.attributes';
import { simpleConfig } from '../../builders';

export const darkroomEc2BulkActionResultSerializerConfig = simpleConfig(
  'darkroom-ec2-bulk-action-result',
  darkroomEc2BulkActionResultAttributes,
);
