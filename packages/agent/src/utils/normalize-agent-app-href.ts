import {
  APP_ROUTES,
  createLibraryAssetRoute,
  createPublishingPostsFilterRoute,
} from '@genfeedai/constants';
import { IngredientCategory } from '@genfeedai/enums';

const LEGACY_GALLERY_CATEGORY: Readonly<Record<string, IngredientCategory>> = {
  audio: IngredientCategory.AUDIO,
  avatar: IngredientCategory.AVATAR,
  gif: IngredientCategory.GIF,
  image: IngredientCategory.IMAGE,
  music: IngredientCategory.MUSIC,
  video: IngredientCategory.VIDEO,
  voice: IngredientCategory.VOICE,
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
): string | undefined {
  if (!href?.trim()) {
    return undefined;
  }

  const trimmed = href.trim();
  const queryIndex = trimmed.search(/[?#]/);
  const path = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : trimmed.slice(queryIndex);

  const libraryHref = normalizeLegacyGalleryHref(path, suffix);
  if (libraryHref) {
    return libraryHref;
  }

  // Bare legacy paths
  if (path === '/review') {
    return `${APP_ROUTES.PUBLISHING.REVIEW}${suffix}`;
  }
  if (path === '/calendar' || path === '/calendar/posts') {
    return `${APP_ROUTES.PUBLISHING.CALENDAR}${suffix}`;
  }
  if (path === '/drafts') {
    const destination = createPublishingPostsFilterRoute({
      publicationState: 'not-posted',
    });
    return suffix.startsWith('?')
      ? `${destination}&${suffix.slice(1)}`
      : `${destination}${suffix}`;
  }

  // Already brand-scoped dead paths: /:org/:brand/review
  const scopedReview = path.match(/^\/([^/]+)\/([^/]+)\/review$/);
  if (scopedReview) {
    const [, orgSlug, brandSlug] = scopedReview;
    if (orgSlug && brandSlug && brandSlug !== '~') {
      return `/${orgSlug}/${brandSlug}${APP_ROUTES.PUBLISHING.REVIEW}${suffix}`;
    }
  }

  const orgReview = path.match(/^\/([^/]+)\/~\/review$/);
  if (orgReview) {
    const [, orgSlug] = orgReview;
    if (orgSlug) {
      return `/${orgSlug}/~${APP_ROUTES.PUBLISHING.REVIEW}${suffix}`;
    }
  }

  return trimmed;
}
