import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/**
 * `/automate/strategies` is a retired URL. Agent strategies are the generic
 * automation policies; the shipped desk is Autopilot.
 */
export default async function AutomateStrategiesRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
}) {
  const { brandSlug, orgSlug } = await params;

  permanentRedirect(
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATE.AUTOPILOT),
  );
}
