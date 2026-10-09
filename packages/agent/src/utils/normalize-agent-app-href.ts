import { IngredientCategory } from '@genfeedai/contracts';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createOrganizationAppRoute,
  createPublishingPostsFilterRoute,
  isPersonalSettingsPath,
  LIBRARY_ASSET_QUERY_KEY,
  parseScopedAppPath,
} from '@genfeedai/contracts/constants';

const LEGACY_GALLERY_CATEGORY: Readonly<Record<string, IngredientCategory>> = {
  audio: IngredientCategory.AUDIO,
  avatar: IngredientCategory.AVATAR,
  gif: IngredientCategory.GIF,
  image: IngredientCategory.IMAGE,
  music: IngredientCategory.MUSIC,
  video: IngredientCategory.VIDEO,
  voice: IngredientCategory.VOICE,
};

const LEGACY_INTERNAL_PATH_REWRITES: Readonly<Record<string, string>> = {
  '/calendar': APP_ROUTES.PUBLISHING.CALENDAR,
  '/calendar/posts': APP_ROUTES.PUBLISHING.CALENDAR,
  '/drafts': createPublishingPostsFilterRoute({
    publicationState: 'not-posted',
  }),
  '/content/posts': APP_ROUTES.PUBLISHING.POSTS,
  '/content/articles': `${APP_ROUTES.PUBLISHING.POSTS}?type=article`,
  '/overview': APP_ROUTES.WORKSPACE.OVERVIEW,
  '/review': APP_ROUTES.PUBLISHING.REVIEW,
};

function appendHrefSuffix(route: string, suffix: string): string {
  if (suffix.startsWith('?') && route.includes('?')) {
    return `${route}&${suffix.slice(1)}`;
  }

  return `${route}${suffix}`;
}

function normalizeLegacyGalleryHref(
  path: string,
  suffix: string,
): string | undefined {
  const match = path.match(/^(\/[^/]+\/[^/]+)?\/g\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) {
    return undefined;
  }

  const [, scope = '', mediaType, assetId] = match;
  const category = mediaType
    ? LEGACY_GALLERY_CATEGORY[mediaType.toLowerCase()]
    : undefined;
  if (!category) {
    return undefined;
  }

  return appendHrefSuffix(
    `${scope}${createLibraryAssetRoute(category, assetId)}`,
    suffix,
  );
}

/**
 * Normalize dead internal agent CTA paths so brand-scoped links do not 404.
 * Mirrors server `AgentRouteRewriteService` / completion-card normalizers.
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
    const isBareLegacy =
      /^\/(?:content\/(?:posts|articles)(?:\/.+)?|overview|review|calendar(?:\/posts)?|drafts)$/.test(
        path,
      );
    const explicitScope = isBareLegacy
      ? { orgSlug: '', brandSlug: '' }
      : parseScopedAppPath(path);
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
    const contentDetail = appPath.match(
      /^\/content\/(?:posts|articles)\/(.+)$/,
    );
    const legacyContent =
      LEGACY_INTERNAL_PATH_REWRITES[appPath] ??
      (contentDetail
        ? `${APP_ROUTES.PUBLISHING.POSTS}/${contentDetail[1]}`
        : undefined);
    if (legacyContent) {
      const scope = explicitScope.orgSlug ? explicitScope : routeScope;
      const destination = scope?.orgSlug
        ? scope.brandSlug
          ? createBrandAppRoute(scope.orgSlug, scope.brandSlug, legacyContent)
          : createOrganizationAppRoute(scope.orgSlug, legacyContent)
        : legacyContent;
      return appendHrefSuffix(destination, suffix);
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

  const libraryHref = normalizeLegacyGalleryHref(path, suffix);
  if (libraryHref) {
    if (path.startsWith('/g/') && routeScope?.orgSlug) {
      return routeScope.brandSlug
        ? createBrandAppRoute(
            routeScope.orgSlug,
            routeScope.brandSlug,
            libraryHref,
          )
        : createOrganizationAppRoute(routeScope.orgSlug, libraryHref);
    }
    return libraryHref;
  }

  return trimmed;
}

/**
 * Turn a Library CTA into a shareable link to the exact generated asset.
 *
 * Persisted agent messages may contain an older bare Library route even when
 * the sibling action already carries the canonical asset id. Enriching the
 * normalized href at render time repairs those transcripts without a data
 * migration, while newly persisted actions can emit the same route directly.
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
