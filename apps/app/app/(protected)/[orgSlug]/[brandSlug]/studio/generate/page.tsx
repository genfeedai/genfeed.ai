import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StudioGenerateWorkspace from '@pages/studio/generate/StudioGenerateWorkspace';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Generate');

export default function StudioGeneratePage() {
  return (
    <Suspense fallback={null}>
      <StudioGenerateWorkspace />
    </Suspense>
  );
}
