import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsAccounts from '@pages/analytics/accounts/analytics-accounts';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Analytics Accounts');

export default function OrgAnalyticsAccountsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsAccounts />
    </Suspense>
  );
}
