import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

const AGENT_PATH_SEGMENT_PATTERN = /\/agent(?:\/|$)/;
const AGENT_THREAD_PATH_PATTERN = /^\/agent\/([^/]+)$/;

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
  const isConversation = AGENT_PATH_SEGMENT_PATTERN.test(nextPathname);
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

/**
 * Extract a standard agent thread id from a normalized protected pathname
 * (`/agent/:id`). Unthreaded entry routes return null.
 */
export function extractAgentThreadIdFromPathname(
  pathname: string,
): string | null {
  const match = pathname.match(AGENT_THREAD_PATH_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const threadId = match[1];
  if (threadId === 'new' || threadId === 'journey' || threadId === 'threads') {
    return null;
  }

  return threadId;
}
