import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Overview');

export default function AnalyticsOverviewPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsOverview scope={PageScope.SUPERADMIN} basePath="/analytics" />
    </Suspense>
  );
}
