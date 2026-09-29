import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import NewEditorProjectPage from './new-editor-project-page';

export const generateMetadata = createPageMetadata('New Project');

export default function EditorNewPage() {
  return <NewEditorProjectPage />;
}
