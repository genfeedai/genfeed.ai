import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandsList from './brands-list';

export const generateMetadata = createPageMetadata('Brands');

export default function BrandsPage() {
  return (
    <Suspense fallback={null}>
      <BrandsList />
    </Suspense>
  );
}
