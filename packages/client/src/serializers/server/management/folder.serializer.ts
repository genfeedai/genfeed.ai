import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { folderSerializerConfig } from '../../configs';

export const FolderSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  folderSerializerConfig,
);
