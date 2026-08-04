import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsSocialPage from './content';

export const generateMetadata = createPageMetadata('Social accounts');

export default function BrandSettingsSocialRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsSocialPage />
    </Suspense>
  );
}
