import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsPublishingPage from './content';

export const generateMetadata = createPageMetadata('Brand Publishing');

export default function BrandSettingsPublishingRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsPublishingPage />
    </Suspense>
  );
}
