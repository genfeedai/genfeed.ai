import { buildSerializer } from '@serializers/builders';
import { taskSerializerConfig } from '@serializers/configs';

export const { TaskSerializer } = buildSerializer(
  'server',
  taskSerializerConfig,
);
