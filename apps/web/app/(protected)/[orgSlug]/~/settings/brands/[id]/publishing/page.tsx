import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsPublishingPage from '@pages/settings/brands/brand-settings-publishing-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Publishing');

export default function BrandSettingsPublishingRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsPublishingPage />
    </Suspense>
  );
}
