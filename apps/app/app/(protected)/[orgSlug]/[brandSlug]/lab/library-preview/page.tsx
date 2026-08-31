import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryLandingVisualPreview from '@pages/library/landing/library-landing-visual-preview';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Library Preview');

export default function LabLibraryPreviewPage() {
  return (
    <Suspense fallback={null}>
      <LibraryLandingVisualPreview />
    </Suspense>
  );
}
