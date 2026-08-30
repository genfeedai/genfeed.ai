import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsHarnessPage from './content';

export const generateMetadata = createPageMetadata('Brand harness');

export default function BrandSettingsHarnessRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsHarnessPage />
    </Suspense>
  );
}
