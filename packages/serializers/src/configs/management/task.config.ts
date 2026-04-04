import { managementTaskAttributes } from '@serializers/attributes/management/task.attributes';
import { simpleConfig } from '@serializers/builders';

export const taskSerializerConfig = simpleConfig(
  'task',
  managementTaskAttributes,
);
