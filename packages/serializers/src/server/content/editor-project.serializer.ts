import { buildSerializer } from '@serializers/builders';
import { editorProjectSerializerConfig } from '@serializers/configs';

export const { EditorProjectSerializer } = buildSerializer(
  'server',
  editorProjectSerializerConfig,
);
