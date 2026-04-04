import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function AnalyticsBrandsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="table" />}>
      <AnalyticsBrandsList basePath="/analytics" />
    </Suspense>
  );
}
