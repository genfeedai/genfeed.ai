import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import GeneratePage from '@protected/fleet/generate/generate-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Generate');

export default function FleetGeneratePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <GeneratePage />
    </Suspense>
  );
}
