import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { SettingsOrganizationSubscriptionRouteProps } from '@props/settings/subscription-page.props';
import { redirect } from 'next/navigation';
import SettingsSubscriptionPage from '../../(pages)/organization/subscription/content';

export const generateMetadata = createPageMetadata('Subscription Settings');

export default async function SettingsOrganizationSubscriptionRoute({
  params,
}: SettingsOrganizationSubscriptionRouteProps) {
  if (!hasOrganizationBillingHint()) {
    const { orgSlug } = await params;
    redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS));
  }

  return <SettingsSubscriptionPage />;
}
