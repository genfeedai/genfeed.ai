import GalleryPage from '@admin/(protected)/darkroom/gallery/gallery-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Gallery');

export default function DarkroomGalleryPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <GalleryPage />
    </Suspense>
  );
}
