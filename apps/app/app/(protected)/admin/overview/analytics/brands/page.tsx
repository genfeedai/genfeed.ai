import { APP_ROUTES } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brands Analytics');

export default function BrandsAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsBrandsList basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS} />
    </Suspense>
  );
}
