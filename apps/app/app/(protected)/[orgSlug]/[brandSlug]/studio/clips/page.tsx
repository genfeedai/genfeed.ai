import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

import ClipsWorkspace from './ClipsWorkspace';

export const generateMetadata = createPageMetadata('Clips');

export default function StudioClipsPage() {
  return (
    <Suspense fallback={null}>
      <ClipsWorkspace />
    </Suspense>
  );
}
