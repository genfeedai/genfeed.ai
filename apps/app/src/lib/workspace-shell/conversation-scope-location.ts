import { APP_ROUTES } from '@genfeedai/constants';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

interface BuildConversationScopeHrefParams {
  readonly brandSlug: string | null;
  readonly organizationSlug: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  readonly threadId: string | null;
}

function scopedPathname(
  pathname: string,
  organizationSlug: string,
  brandSlug: string | null,
): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return `/${organizationSlug}/${brandSlug ?? '~'}${APP_ROUTES.AGENT.ROOT}`;
  }

  segments[0] = organizationSlug;
  segments[1] = brandSlug ?? '~';
  return `/${segments.join('/')}`;
}

export function buildConversationScopeHref({
  brandSlug,
  organizationSlug,
  pathname,
  searchParams,
  threadId,
}: BuildConversationScopeHrefParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete('overlay');
  nextSearchParams.delete('overlayRef');

  const nextPathname = scopedPathname(pathname, organizationSlug, brandSlug);
  const isConversation = /\/agent(?:\/|$)/.test(nextPathname);
  if (isConversation) {
    nextSearchParams.delete('thread');
  } else if (threadId) {
    nextSearchParams.set('thread', threadId);
  } else {
    nextSearchParams.delete('thread');
  }

  return appendSearchParamsToHref(nextPathname, nextSearchParams);
}

export function buildOrganizationNewThreadHref(
  organizationSlug: string,
): string {
  return `/${organizationSlug}/~${APP_ROUTES.AGENT.NEW}`;
}

export function buildScopedThreadHref(
  organizationSlug: string,
  brandSlug: string | null,
  threadId: string,
): string {
  return `/${organizationSlug}/${brandSlug ?? '~'}${APP_ROUTES.AGENT.ROOT}/${threadId}`;
}
