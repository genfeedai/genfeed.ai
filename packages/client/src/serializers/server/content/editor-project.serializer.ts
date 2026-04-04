import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { editorProjectSerializerConfig } from '../../configs';

export const EditorProjectSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  editorProjectSerializerConfig,
);
