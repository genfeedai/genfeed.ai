import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
  isPersonalSettingsPath,
  LIBRARY_ASSET_QUERY_KEY,
  parseScopedAppPath,
} from '@genfeedai/contracts/constants';

/**
 * Scope internal agent CTA paths to the current org/brand so links do not 404.
 */
export function normalizeAgentAppHref(
  href: string | undefined | null,
  routeScope?: ReturnType<typeof parseScopedAppPath>,
): string | undefined {
  if (!href?.trim()) {
    return undefined;
  }

  const trimmed = href.trim();
  const queryIndex = trimmed.search(/[?#]/);
  const path = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : trimmed.slice(queryIndex);

  if (path.startsWith('/') && !path.startsWith('//')) {
    const explicitScope = parseScopedAppPath(path);
    const appPath = explicitScope.orgSlug
      ? `/${path.split('/').filter(Boolean).slice(2).join('/')}`
      : path;
    const orgSlug = explicitScope.orgSlug || routeScope?.orgSlug;
    if (
      appPath === APP_ROUTES.SETTINGS.ROOT ||
      appPath.startsWith(`${APP_ROUTES.SETTINGS.ROOT}/`)
    ) {
      if (
        isPersonalSettingsPath(appPath) &&
        !(explicitScope.orgSlug && appPath === APP_ROUTES.SETTINGS.ROOT)
      ) {
        return `${appPath}${suffix}`;
      }
      if (explicitScope.orgSlug && appPath === APP_ROUTES.SETTINGS.ROOT) {
        return trimmed;
      }
      if (orgSlug) {
        const orgRoute = createOrganizationAppRoute(orgSlug, appPath);
        const isBrandOnly = orgRoute !== `/${orgSlug}/~${appPath}`;
        const brandSlug =
          explicitScope.brandSlug ||
          (routeScope?.orgSlug === orgSlug ? routeScope.brandSlug : undefined);
        return `${isBrandOnly && brandSlug ? createBrandAppRoute(orgSlug, brandSlug, appPath) : orgRoute}${suffix}`;
      }
    }
    const firstSegment = path.split('/').filter(Boolean)[0];
    const scopedRoots = [
      APP_ROUTE_PREFIXES.AGENT,
      APP_ROUTE_PREFIXES.WORKSPACE,
      APP_ROUTE_PREFIXES.LIBRARY,
      APP_ROUTE_PREFIXES.PUBLISHING,
      APP_ROUTE_PREFIXES.ANALYTICS,
      APP_ROUTE_PREFIXES.AUTOMATION,
      APP_ROUTE_PREFIXES.DISCOVERY,
      APP_ROUTE_PREFIXES.STUDIO,
    ];
    if (
      !explicitScope.orgSlug &&
      routeScope?.orgSlug &&
      scopedRoots.some((root) => root === `/${firstSegment}`)
    ) {
      const isOrganizationSurface = firstSegment === 'agent';
      return `${
        !isOrganizationSurface && routeScope.brandSlug
          ? createBrandAppRoute(routeScope.orgSlug, routeScope.brandSlug, path)
          : createOrganizationAppRoute(routeScope.orgSlug, path)
      }${suffix}`;
    }
  }

  return trimmed;
}

/**
 * Turn a Library CTA into a shareable link to the exact generated asset.
 *
 * A Library CTA may carry a bare Library route even when the sibling action
 * already holds the canonical asset id; enriching the normalized href at
 * render time points it at that exact asset.
 */
export function normalizeAgentAssetHref(
  href: string | undefined | null,
  assetId: string | undefined,
): string | undefined {
  const normalizedHref = normalizeAgentAppHref(href);
  if (!normalizedHref || !assetId || !normalizedHref.includes('/library/')) {
    return normalizedHref;
  }

  const hashIndex = normalizedHref.indexOf('#');
  const hrefWithoutHash =
    hashIndex === -1 ? normalizedHref : normalizedHref.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : normalizedHref.slice(hashIndex);
  const queryIndex = hrefWithoutHash.indexOf('?');
  const path =
    queryIndex === -1 ? hrefWithoutHash : hrefWithoutHash.slice(0, queryIndex);
  const searchParams = new URLSearchParams(
    queryIndex === -1 ? '' : hrefWithoutHash.slice(queryIndex + 1),
  );
  searchParams.set(LIBRARY_ASSET_QUERY_KEY, assetId);

  return `${path}?${searchParams.toString()}${hash}`;
}
