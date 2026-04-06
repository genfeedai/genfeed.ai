import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { editorProjectSerializerConfig } from '../../configs';

export const EditorProjectSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  editorProjectSerializerConfig,
);
