import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { isEEEnabled } from '@/lib/config/edition';
import SettingsBillingPage from './content';

export const generateMetadata = createPageMetadata('Billing Settings');

export default function SettingsOrganizationBillingRoute() {
  if (!isEEEnabled()) {
    redirect('/settings/organization/api-keys');
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsBillingPage />
    </Suspense>
  );
}
