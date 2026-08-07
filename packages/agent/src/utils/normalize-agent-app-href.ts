import { APP_ROUTES } from '@genfeedai/constants';

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
    return `${APP_ROUTES.PUBLISH.REVIEW}${suffix}`;
  }
  if (path === '/calendar' || path === '/calendar/posts') {
    return `${APP_ROUTES.PUBLISH.CALENDAR}${suffix}`;
  }
  if (path === '/publish/drafts' || path === '/drafts') {
    return `${APP_ROUTES.PUBLISH.REVIEW}${suffix}`;
  }

  // Already brand-scoped dead paths: /:org/:brand/review
  const scopedReview = path.match(/^\/([^/]+)\/([^/]+)\/review$/);
  if (scopedReview) {
    const [, orgSlug, brandSlug] = scopedReview;
    if (orgSlug && brandSlug && brandSlug !== '~') {
      return `/${orgSlug}/${brandSlug}${APP_ROUTES.PUBLISH.REVIEW}${suffix}`;
    }
  }

  const orgReview = path.match(/^\/([^/]+)\/~\/review$/);
  if (orgReview) {
    const [, orgSlug] = orgReview;
    if (orgSlug) {
      return `/${orgSlug}/~${APP_ROUTES.PUBLISH.REVIEW}${suffix}`;
    }
  }

  return trimmed;
}
