import { workspaceTaskAttributes } from '@serializers/attributes/content/workspace-task.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const workspaceTaskSerializerConfig = {
  attributes: workspaceTaskAttributes,
  type: 'workspace-task',
  ...STANDARD_ENTITY_RELS,
};
