import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandDetail from '@pages/brands/brand-detail';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Details');

export default function BrandDetailPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandDetail />
    </Suspense>
  );
}
