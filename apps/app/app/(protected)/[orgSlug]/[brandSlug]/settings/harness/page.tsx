import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsHarnessPage from './content';

export const generateMetadata = createPageMetadata('Brand harness');

export default function BrandSettingsHarnessRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsHarnessPage />
    </Suspense>
  );
}
