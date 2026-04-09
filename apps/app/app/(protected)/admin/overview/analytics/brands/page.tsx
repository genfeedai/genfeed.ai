import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function BrandsAnalyticsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="table" />}>
      <AnalyticsBrandsList basePath="/analytics" />
    </Suspense>
  );
}
