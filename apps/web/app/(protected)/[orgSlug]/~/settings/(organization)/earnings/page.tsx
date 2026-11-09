import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';
import type { SettingsOrganizationSubscriptionRouteProps } from '@/features/settings/props/subscription-page.props';
import SettingsEarningsPage from '../../(pages)/organization/earnings/content';

export const generateMetadata = createPageMetadata('Earnings');

export default async function SettingsOrganizationEarningsRoute({
  params,
}: SettingsOrganizationSubscriptionRouteProps) {
  // Creator payments move metered credits, which only exist where
  // organization billing runs.
  if (!hasOrganizationBillingHint()) {
    const { orgSlug } = await params;
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS));
  }

  return <SettingsEarningsPage />;
}
