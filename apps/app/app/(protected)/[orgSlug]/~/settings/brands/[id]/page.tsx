import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandDetail from './brand-detail';

export const generateMetadata = createPageMetadata('Brand Details');

export default function BrandDetailPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandDetail />
    </Suspense>
  );
}
