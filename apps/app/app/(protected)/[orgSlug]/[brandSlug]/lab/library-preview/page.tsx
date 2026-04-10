import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryLandingVisualPreview from '@pages/library/landing/library-landing-visual-preview';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Library Preview');

export default function LabLibraryPreviewPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LibraryLandingVisualPreview />
    </Suspense>
  );
}
