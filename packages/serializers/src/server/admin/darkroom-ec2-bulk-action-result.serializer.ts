import { buildSerializer } from '@serializers/builders';
import { darkroomEc2BulkActionResultSerializerConfig } from '@serializers/configs';

export const { DarkroomEc2BulkActionResultSerializer } = buildSerializer(
  'server',
  darkroomEc2BulkActionResultSerializerConfig,
);
