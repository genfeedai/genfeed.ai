import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy org-shell `/discovery/discovery` → `/discovery/overview`.
 */
export default async function OrgDiscoverDiscoveryLegacyRoute({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  permanentRedirect(
    createOrganizationAppRoute(orgSlug, APP_ROUTES.DISCOVERY.OVERVIEW),
  );
}
