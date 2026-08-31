import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsCostUsagePage from './content';

export const generateMetadata = createPageMetadata('Brand Cost & Usage');

export default function BrandSettingsCostUsageRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsCostUsagePage />
    </Suspense>
  );
}
