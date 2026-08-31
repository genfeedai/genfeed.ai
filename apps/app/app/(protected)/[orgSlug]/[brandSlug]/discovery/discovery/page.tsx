import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy `/discovery/discovery` was a tautology. Canonical Discovery home is
 * `/discovery/overview` (same pattern as analytics/automation/workspace).
 */
export default async function DiscoveryDiscoveryLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.DISCOVERY.OVERVIEW),
  );
}
