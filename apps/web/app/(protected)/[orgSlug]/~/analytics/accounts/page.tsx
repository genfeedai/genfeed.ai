import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsAccounts from '@/features/analytics/accounts/analytics-accounts';

export const generateMetadata = createPageMetadata('Analytics Accounts');

export default function OrgAnalyticsAccountsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsAccounts />
    </Suspense>
  );
}
