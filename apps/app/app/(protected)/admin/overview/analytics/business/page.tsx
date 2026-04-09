import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BusinessDashboard from './business-dashboard';

export const generateMetadata = createPageMetadata('Business Analytics');

export default function BusinessAnalyticsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BusinessDashboard />
    </Suspense>
  );
}
