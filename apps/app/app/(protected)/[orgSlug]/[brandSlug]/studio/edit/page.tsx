import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import EditorProjectsPage from './editor-projects-page';

export const generateMetadata = createPageMetadata('Editor');

export default function EditorPage() {
  return <EditorProjectsPage />;
}
