import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomEc2BulkActionResultSerializerConfig } from '../../configs';

export const DarkroomEc2BulkActionResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomEc2BulkActionResultSerializerConfig,
);
