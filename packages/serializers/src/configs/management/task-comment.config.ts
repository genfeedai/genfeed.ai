import { taskCommentAttributes } from '@serializers/attributes/management/task-comment.attributes';
import { simpleConfig } from '@serializers/builders';

export const taskCommentSerializerConfig = simpleConfig(
  'task-comment',
  taskCommentAttributes,
);
