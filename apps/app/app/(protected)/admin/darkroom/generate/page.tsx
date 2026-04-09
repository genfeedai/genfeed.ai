import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import GeneratePage from '@protected/darkroom/generate/generate-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Generate');

export default function DarkroomGeneratePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <GeneratePage />
    </Suspense>
  );
}
