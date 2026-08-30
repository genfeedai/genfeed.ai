import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsCostUsagePage from './content';

export const generateMetadata = createPageMetadata('Brand Cost & Usage');

export default function BrandSettingsCostUsageRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsCostUsagePage />
    </Suspense>
  );
}
