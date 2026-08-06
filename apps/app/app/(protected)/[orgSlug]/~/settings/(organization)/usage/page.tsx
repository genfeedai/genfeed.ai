import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Usage');

interface SettingsOrganizationUsageRouteProps {
  params: Promise<{ orgSlug: string }>;
}

/** Legacy route — usage lives on the consolidated Billing page. */
export default async function SettingsOrganizationUsageRoute({
  params,
}: SettingsOrganizationUsageRouteProps) {
  const { orgSlug } = await params;
  redirect(
    `${createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.BILLING)}#usage`,
  );
}
