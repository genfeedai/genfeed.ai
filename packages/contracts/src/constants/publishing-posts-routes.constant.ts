import { APP_ROUTES } from './routes.constant';

export const PUBLISHING_POSTS_QUERY_KEYS = {
  ACCOUNT: 'account',
  PUBLICATION_STATE: 'publicationState',
  RELEASE: 'release',
  STATUS: 'status',
  /** List rows, status-column board, or per-account grid. */
  VIEW: 'view',
} as const;

/** Selectable Posts view modes. Unknown values fall back to list. */
export const PUBLISHING_POSTS_VIEW_MODES = ['list', 'board', 'grid'] as const;

export type PublishingPostsViewMode =
  (typeof PUBLISHING_POSTS_VIEW_MODES)[number];

/** Unknown or missing values fall back to the list view. */
export function parsePublishingPostsViewMode(
  value: string | null | undefined,
): PublishingPostsViewMode {
  return PUBLISHING_POSTS_VIEW_MODES.find((mode) => mode === value) ?? 'list';
}

export const PUBLISHING_POSTS_PUBLICATION_STATES = [
  'not-posted',
  'posted',
] as const;

export type PublishingPostsPublicationState =
  (typeof PUBLISHING_POSTS_PUBLICATION_STATES)[number];

export interface PublishingPostsFilterRouteOptions {
  publicationState?: PublishingPostsPublicationState;
  /** Release-group id; opens the Posts library with its detail drawer. */
  release?: string;
  status?: string;
}

export interface PublishingApprovalsRouteOptions {
  /** Review inbox gate to focus (`IReviewInboxItem.id`). */
  approval?: string | null;
  /** Approval queue filter, e.g. `ready`. */
  filter?: string | null;
  /** Review item to focus; opens within `run` when one is given. */
  item?: string | null;
  /** Turbo run to open. */
  run?: string | null;
}

/**
 * Deep link into the approvals queue: `/publishing/approvals`, then the Turbo
 * run and the item as path segments. The filter and the review inbox gate stay
 * query params. An item without a run has no path of its own, so it rides as
 * `?item=`.
 */
export function createPublishingApprovalsRoute({
  approval,
  filter,
  item,
  run,
}: PublishingApprovalsRouteOptions = {}): string {
  let path: string = APP_ROUTES.PUBLISHING.APPROVALS;
  const params = new URLSearchParams();
  if (run) {
    path += `/${encodeURIComponent(run)}`;
    if (item) path += `/${encodeURIComponent(item)}`;
  } else if (item) {
    params.set('item', item);
  }
  if (filter) params.set('filter', filter);
  if (approval) params.set('approval', approval);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export interface PublishingApprovalsPath {
  /** Pathname up to and including the `approvals` segment, scope included. */
  basePath: string;
  item: string | null;
  run: string | null;
}

/**
 * Inverse of {@link createPublishingApprovalsRoute} for a scoped pathname
 * (`/acme/brand/publishing/approvals/run-1/item-2`). A pathname outside the
 * approvals queue comes back unchanged with no run and no item.
 */
export function parsePublishingApprovalsPath(
  pathname: string,
): PublishingApprovalsPath {
  const segments = pathname.split('/').filter(Boolean);
  const publishingIndex = segments.lastIndexOf('publishing');
  const approvalsIndex = publishingIndex + 1;
  if (publishingIndex === -1 || segments[approvalsIndex] !== 'approvals') {
    return { basePath: pathname, item: null, run: null };
  }
  const decode = (segment: string | undefined): string | null => {
    if (!segment) return null;
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  };
  return {
    basePath: `/${segments.slice(0, approvalsIndex + 1).join('/')}`,
    item: decode(segments[approvalsIndex + 2]),
    run: decode(segments[approvalsIndex + 1]),
  };
}

/** Build a canonical Posts library deep link with lifecycle filters. */
export function createPublishingPostsFilterRoute({
  publicationState,
  release,
  status,
}: PublishingPostsFilterRouteOptions = {}): string {
  const params: string[] = [];

  if (publicationState) {
    params.push(
      `${PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE}=${encodeURIComponent(publicationState)}`,
    );
  }

  if (status) {
    params.push(
      `${PUBLISHING_POSTS_QUERY_KEYS.STATUS}=${encodeURIComponent(status)}`,
    );
  }

  if (release) {
    params.push(
      `${PUBLISHING_POSTS_QUERY_KEYS.RELEASE}=${encodeURIComponent(release)}`,
    );
  }

  const queryString = params.join('&');
  return queryString
    ? `${APP_ROUTES.PUBLISHING.POSTS}?${queryString}`
    : APP_ROUTES.PUBLISHING.POSTS;
}
