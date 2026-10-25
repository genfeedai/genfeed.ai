import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StudioPlaygroundWorkspace from '@pages/studio/playground/StudioPlaygroundWorkspace';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Playground');

export default function StudioPlaygroundPage() {
  return (
    <Suspense fallback={null}>
      <StudioPlaygroundWorkspace />
    </Suspense>
  );
}
