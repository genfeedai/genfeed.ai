import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Retired org-shell Socials peer → Overview.
 */
export default async function OrgDiscoverSocialsLegacyRoute({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  permanentRedirect(
    createOrganizationAppRoute(orgSlug, APP_ROUTES.DISCOVERY.OVERVIEW),
  );
}
