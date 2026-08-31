import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function AnalyticsBrandsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBrandsList basePath="/analytics" />
    </Suspense>
  );
}
