import { workspaceInboxReadAttributes } from '@serializers/attributes/management/workspace-inbox-read.attributes';
import { simpleConfig } from '@serializers/builders';

export const workspaceInboxReadSerializerConfig = simpleConfig(
  'workspace-inbox-read',
  workspaceInboxReadAttributes,
);
