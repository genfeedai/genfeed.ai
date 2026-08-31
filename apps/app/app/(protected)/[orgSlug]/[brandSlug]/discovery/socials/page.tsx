import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * Retired Socials peer — same TrendsList as Overview.
 * Keep the route for deep links; permanently redirect.
 */
export default async function DiscoverySocialsLegacyRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.DISCOVERY.OVERVIEW),
  );
}
