import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsCostUsagePage from './content';

export const generateMetadata = createPageMetadata('Brand Cost & Usage');

export default function BrandSettingsCostUsageRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsCostUsagePage />
    </Suspense>
  );
}
