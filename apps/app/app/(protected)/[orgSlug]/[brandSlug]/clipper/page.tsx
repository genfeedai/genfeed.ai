import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

import ClipperWorkspace from './ClipperWorkspace';

export const generateMetadata = createPageMetadata('Clipper');

export default function StudioClipperPage() {
  return (
    <Suspense fallback={null}>
      <ClipperWorkspace />
    </Suspense>
  );
}
