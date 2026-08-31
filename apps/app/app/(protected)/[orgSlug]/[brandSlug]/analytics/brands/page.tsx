import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function AnalyticsBrandsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsBrandsList basePath="/analytics" />
    </Suspense>
  );
}
