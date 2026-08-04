import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy org-shell `/discover/discovery` → `/discover/overview`.
 */
export default async function OrgDiscoverDiscoveryLegacyRoute({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  permanentRedirect(
    createOrganizationAppRoute(orgSlug, APP_ROUTES.DISCOVER.OVERVIEW),
  );
}
