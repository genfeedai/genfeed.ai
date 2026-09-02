'use client';

import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AnalyticsOrganizationsList from '@protected/overview/analytics/organizations/analytics-organizations-list';

/**
 * `/admin/organization` without `?id=` is the organizations list. The live
 * product page is this analytics table — render it here so leftover hrefs
 * and typed URLs do not bounce through a redirect.
 */
export default function AdminOrganizationsLanding() {
  return (
    <AnalyticsProvider>
      <AnalyticsOrganizationsList
        basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
      />
    </AnalyticsProvider>
  );
}
