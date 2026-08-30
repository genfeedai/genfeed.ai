import { APP_ROUTES } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Overview');

export default function AnalyticsOverviewPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsOverview
        scope={PageScope.SUPERADMIN}
        basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
      />
    </Suspense>
  );
}
