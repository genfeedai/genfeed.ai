import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import EditorWorkspace from './EditorWorkspace';

export const generateMetadata = createPageMetadata('Editor');

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorWorkspace />
    </Suspense>
  );
}
