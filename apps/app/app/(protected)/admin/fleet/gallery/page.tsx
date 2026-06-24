import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import GalleryPage from '@protected/fleet/gallery/gallery-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Gallery');

export default function FleetGalleryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <GalleryPage />
    </Suspense>
  );
}
