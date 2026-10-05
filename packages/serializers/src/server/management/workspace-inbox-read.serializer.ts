import { buildSerializer } from '@serializers/builders';
import { workspaceInboxReadSerializerConfig } from '@serializers/configs/management/workspace-inbox-read.config';

export const { WorkspaceInboxReadSerializer } = buildSerializer(
  'server',
  workspaceInboxReadSerializerConfig,
);
