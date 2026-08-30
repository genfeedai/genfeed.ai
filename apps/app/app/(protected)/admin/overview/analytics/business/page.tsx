import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BusinessDashboard from './business-dashboard';

export const generateMetadata = createPageMetadata('Business Analytics');

export default function BusinessAnalyticsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BusinessDashboard />
    </Suspense>
  );
}
