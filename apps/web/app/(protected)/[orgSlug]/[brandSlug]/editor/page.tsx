import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import EditorWorkspace from '@/features/studio/editor/EditorWorkspace';

export const generateMetadata = createPageMetadata('Editor');

export default function EditorPage() {
  return <EditorWorkspace />;
}
