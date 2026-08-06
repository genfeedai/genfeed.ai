import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Billing Settings');

interface SettingsOrganizationBillingRouteProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Legacy path — Billing is a nav group, not a page.
 * Plan → Subscription; wallet top-up → Credits.
 */
export default async function SettingsOrganizationBillingRoute({
  params,
}: SettingsOrganizationBillingRouteProps) {
  const { orgSlug } = await params;
  const target = hasOrganizationBillingHint()
    ? APP_ROUTES.SETTINGS.SUBSCRIPTION
    : APP_ROUTES.SETTINGS.CREDITS;
  redirect(createOrganizationAppRoute(orgSlug, target));
}
