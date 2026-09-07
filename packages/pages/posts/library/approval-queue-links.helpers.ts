import { APP_ROUTES } from '@genfeedai/contracts/constants';

/** Query keys that identify the operator's place in the approval queue. */
const APPROVAL_QUEUE_STATE_KEYS = ['batch', 'item'] as const;

function pickApprovalQueueState(
  searchParams: URLSearchParams | string,
): URLSearchParams {
  const source = new URLSearchParams(searchParams);
  const picked = new URLSearchParams();
  for (const key of APPROVAL_QUEUE_STATE_KEYS) {
    const value = source.get(key);
    if (value) picked.set(key, value);
  }
  return picked;
}

function withQuery(pathname: string, query: URLSearchParams): string {
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

/**
 * Posts → Approval queue. Carries the selected batch and item along so a
 * round trip lands the operator back on the same decision.
 */
export function buildApprovalQueueHref(
  searchParams: URLSearchParams | string,
): string {
  return withQuery(
    APP_ROUTES.PUBLISHING.REVIEW,
    pickApprovalQueueState(searchParams),
  );
}

/**
 * Approval queue → Posts. Keeps batch and item in the URL so the "Approval
 * queue" link on Posts returns to the same selection.
 */
export function buildPostsHrefFromApprovalQueue(
  searchParams: URLSearchParams | string,
): string {
  return withQuery(
    APP_ROUTES.PUBLISHING.POSTS,
    pickApprovalQueueState(searchParams),
  );
}
