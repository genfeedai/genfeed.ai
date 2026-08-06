import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Credits Settings');

interface SettingsOrganizationCreditsRouteProps {
  params: Promise<{ orgSlug: string }>;
}

/** Legacy route — credits live on the consolidated Billing page. */
export default async function SettingsOrganizationCreditsRoute({
  params,
}: SettingsOrganizationCreditsRouteProps) {
  const { orgSlug } = await params;
  redirect(createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.BILLING));
}
