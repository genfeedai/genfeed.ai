import { buildSerializer } from '@serializers/builders';
import { taskCommentSerializerConfig } from '@serializers/configs';

export const { TaskCommentSerializer } = buildSerializer(
  'server',
  taskCommentSerializerConfig,
);
