import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsKitPage from './content';

export const generateMetadata = createPageMetadata('Brand Kit');

export default function BrandSettingsKitRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsKitPage />
    </Suspense>
  );
}
