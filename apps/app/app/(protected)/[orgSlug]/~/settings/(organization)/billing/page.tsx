import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import { isEEEnabled } from '@/lib/config/edition';
import SettingsBillingPage from '../../(pages)/organization/billing/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

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
    <SettingsOrganizationRouteShell>
      <SettingsBillingPage />
    </SettingsOrganizationRouteShell>
  );
}
