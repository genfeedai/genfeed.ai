import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/constants';

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
