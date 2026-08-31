import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsPublishingPage from './content';

export const generateMetadata = createPageMetadata('Brand Publishing');

export default function BrandSettingsPublishingRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsPublishingPage />
    </Suspense>
  );
}
