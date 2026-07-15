import { type APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';

export type LegacyWorkflowRouteSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

interface BuildLegacyWorkflowRouteRedirectOptions {
  brandSlug: string;
  destination:
    | typeof APP_ROUTES.ORCHESTRATION.AUTOPILOT
    | typeof APP_ROUTES.ORCHESTRATION.CONFIGURATION;
  orgSlug: string;
  searchParams?: LegacyWorkflowRouteSearchParams;
}

/**
 * Keeps old workflow navigation links inside their existing route scope while
 * handing authorization and the capability to its canonical orchestration
 * owner. Opaque product and conversation-shell query parameters survive the
 * compatibility redirect.
 */
export function buildLegacyWorkflowRouteRedirect({
  brandSlug,
  destination,
  orgSlug,
  searchParams = {},
}: BuildLegacyWorkflowRouteRedirectOptions): string {
  const preservedSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      preservedSearchParams.set(key, value);
      continue;
    }

    for (const item of value) {
      preservedSearchParams.append(key, item);
    }
  }

  const query = preservedSearchParams.toString();
  const destinationWithQuery = query ? `${destination}?${query}` : destination;

  return createBrandAppRoute(orgSlug, brandSlug, destinationWithQuery);
}
