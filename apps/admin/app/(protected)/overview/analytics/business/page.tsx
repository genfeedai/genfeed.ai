import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BusinessDashboard from '@pages/analytics/business/business-dashboard';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Business Analytics');

export default function BusinessAnalyticsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BusinessDashboard />
    </Suspense>
  );
}
