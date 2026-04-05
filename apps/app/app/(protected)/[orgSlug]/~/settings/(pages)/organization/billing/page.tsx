import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsBillingPage from '@pages/settings/billing/settings-billing-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Billing Settings');

export default function SettingsOrganizationBillingRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsBillingPage />
    </Suspense>
  );
}
