import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsKitPage from './content';

export const generateMetadata = createPageMetadata('Brand Kit');

export default function BrandSettingsKitRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsKitPage />
    </Suspense>
  );
}
