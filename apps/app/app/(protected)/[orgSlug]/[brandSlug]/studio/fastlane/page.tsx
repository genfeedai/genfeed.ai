import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FastlanePageContent from '@pages/studio/fastlane';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fastlane');

export default function StudioFastlanePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FastlanePageContent />
    </Suspense>
  );
}
