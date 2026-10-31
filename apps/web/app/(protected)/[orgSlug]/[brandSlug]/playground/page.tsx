import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import StudioPlaygroundWorkspace from '@/features/studio/playground/StudioPlaygroundWorkspace';

export const generateMetadata = createPageMetadata('Playground');

export default function StudioPlaygroundPage() {
  return (
    <Suspense fallback={null}>
      <StudioPlaygroundWorkspace />
    </Suspense>
  );
}
