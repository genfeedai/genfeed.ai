import { buildSerializer } from '@serializers/builders';
import { folderSerializerConfig } from '@serializers/configs';

export const { FolderSerializer } = buildSerializer(
  'server',
  folderSerializerConfig,
);
