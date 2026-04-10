import { managementTaskAttributes } from '@serializers/attributes/management/task.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const taskSerializerConfig = {
  attributes: managementTaskAttributes,
  type: 'task',
  ...STANDARD_ENTITY_RELS,
};
