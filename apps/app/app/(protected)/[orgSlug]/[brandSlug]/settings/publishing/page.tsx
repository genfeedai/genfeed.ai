import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsPublishingPage from './content';

export const generateMetadata = createPageMetadata('Brand Publishing');

export default function BrandSettingsPublishingRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsPublishingPage />
    </Suspense>
  );
}
