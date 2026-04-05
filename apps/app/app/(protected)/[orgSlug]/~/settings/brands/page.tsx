import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandsList from '@pages/brands/list/brands-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands');

export default function BrandsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandsList />
    </Suspense>
  );
}
