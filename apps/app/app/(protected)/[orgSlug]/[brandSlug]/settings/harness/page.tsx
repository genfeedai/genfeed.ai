import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsHarnessPage from './content';

export const generateMetadata = createPageMetadata('Brand harness');

export default function BrandSettingsHarnessRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsHarnessPage />
    </Suspense>
  );
}
