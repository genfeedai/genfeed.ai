import { editorProjectAttributes } from '@serializers/attributes/content/editor-project.attributes';
import { simpleConfig } from '@serializers/builders';

export const editorProjectSerializerConfig = simpleConfig(
  'editor-project',
  editorProjectAttributes,
);
