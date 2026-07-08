import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { isEEEnabled } from '@/lib/config/edition';
import SettingsBillingPage from './content';

export const generateMetadata = createPageMetadata('Billing Settings');

interface SettingsOrganizationBillingRouteProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function SettingsOrganizationBillingRoute({
  params,
}: SettingsOrganizationBillingRouteProps) {
  if (!isEEEnabled()) {
    const { orgSlug } = await params;
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS));
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsBillingPage />
    </Suspense>
  );
}
