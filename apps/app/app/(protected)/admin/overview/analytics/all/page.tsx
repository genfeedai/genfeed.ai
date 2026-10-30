import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsOverview from '@/features/analytics/overview/analytics-overview';

export const generateMetadata = createPageMetadata('Analytics Overview');

export default function AnalyticsOverviewPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsOverview
        scope={PageScope.SUPERADMIN}
        basePath={APP_ROUTES.ADMIN.ROOT}
      />
    </Suspense>
  );
}
