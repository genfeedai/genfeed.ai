import { editorProjectAttributes } from '../../attributes/content/editor-project.attributes';
import { simpleConfig } from '../../builders';

export const editorProjectSerializerConfig = simpleConfig(
  'editor-project',
  editorProjectAttributes,
);
