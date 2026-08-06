import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

interface SettingsOrganizationBillingRouteProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Legacy path only — Billing is a nav group, not a page.
 * Prefer next.config permanent redirect; this is the App Router hard cut.
 */
export default async function SettingsOrganizationBillingRoute({
  params,
}: SettingsOrganizationBillingRouteProps) {
  const { orgSlug } = await params;
  const target = hasOrganizationBillingHint()
    ? APP_ROUTES.SETTINGS.SUBSCRIPTION
    : APP_ROUTES.SETTINGS.CREDITS;
  permanentRedirect(createOrganizationAppRoute(orgSlug, target));
}
