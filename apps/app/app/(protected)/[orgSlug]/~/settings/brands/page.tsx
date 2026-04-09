import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandsList from './brands-list';

export const generateMetadata = createPageMetadata('Brands');

export default function BrandsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandsList />
    </Suspense>
  );
}
