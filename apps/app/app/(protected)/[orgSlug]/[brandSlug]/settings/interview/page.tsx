import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsInterviewPage from './content';

export const generateMetadata = createPageMetadata('Brand Interview');

export default function BrandSettingsInterviewRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsInterviewPage />
    </Suspense>
  );
}
