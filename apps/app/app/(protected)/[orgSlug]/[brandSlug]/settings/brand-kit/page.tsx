import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandKitPage from './content';

export const generateMetadata = createPageMetadata('Brand Kit');

export default function BrandKitRoute() {
  return (
    <Suspense fallback={null}>
      <BrandKitPage />
    </Suspense>
  );
}
