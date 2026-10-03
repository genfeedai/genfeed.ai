import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { SettingsOrganizationSubscriptionRouteProps } from '@props/settings/subscription-page.props';
import { redirect } from 'next/navigation';
import SettingsReferralsPage from '../../(pages)/organization/referrals/content';

export const generateMetadata = createPageMetadata('Referrals');

export default async function SettingsOrganizationReferralsRoute({
  params,
}: SettingsOrganizationSubscriptionRouteProps) {
  // Referral rewards are paid in purchased credits, which only exist where
  // organization billing runs.
  if (!hasOrganizationBillingHint()) {
    const { orgSlug } = await params;
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS));
  }

  return <SettingsReferralsPage />;
}
