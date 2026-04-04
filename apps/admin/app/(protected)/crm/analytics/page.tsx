import AnalyticsPage from '@admin/(protected)/crm/analytics/analytics-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('CRM Analytics');

export default function Page() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsPage />
    </Suspense>
  );
}
