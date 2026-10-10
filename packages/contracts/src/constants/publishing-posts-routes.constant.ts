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
  /** Review batch to open. */
  batch?: string | null;
  /** Approval queue filter, e.g. `ready`. */
  filter?: string | null;
  /** Review item to focus. */
  item?: string | null;
}

/** #5502 deep link into the Posts approval view. */
export function createPublishingApprovalsRoute({
  batch,
  filter,
  item,
}: PublishingApprovalsRouteOptions = {}): string {
  const params = new URLSearchParams({ view: 'approvals' });
  if (batch) params.set('batch', batch);
  if (filter) params.set('filter', filter);
  if (item) params.set('item', item);
  return `${APP_ROUTES.PUBLISHING.POSTS}?${params.toString()}`;
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
