import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy `/discover/discovery` was a tautology. Canonical Discover home is
 * `/discover/overview` (same pattern as analytics/automate/workspace).
 */
export default async function DiscoverDiscoveryLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.DISCOVER.OVERVIEW),
  );
}
