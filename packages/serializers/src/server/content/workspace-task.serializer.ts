import { buildSerializer } from '@serializers/builders';
import { workspaceTaskSerializerConfig } from '@serializers/configs';

export const { WorkspaceTaskSerializer } = buildSerializer(
  'server',
  workspaceTaskSerializerConfig,
);
