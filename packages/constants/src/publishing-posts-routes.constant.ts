import { APP_ROUTES } from './routes.constant';

export const PUBLISHING_POSTS_QUERY_KEYS = {
  ACCOUNT: 'account',
  PUBLICATION_STATE: 'publicationState',
  STATUS: 'status',
} as const;

export const PUBLISHING_POSTS_PUBLICATION_STATES = [
  'not-posted',
  'posted',
] as const;

export type PublishingPostsPublicationState =
  (typeof PUBLISHING_POSTS_PUBLICATION_STATES)[number];

export interface PublishingPostsFilterRouteOptions {
  publicationState?: PublishingPostsPublicationState;
  status?: string;
}

/** Build a canonical Posts library deep link with lifecycle filters. */
export function createPublishingPostsFilterRoute({
  publicationState,
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

  const queryString = params.join('&');
  return queryString
    ? `${APP_ROUTES.PUBLISHING.POSTS}?${queryString}`
    : APP_ROUTES.PUBLISHING.POSTS;
}
