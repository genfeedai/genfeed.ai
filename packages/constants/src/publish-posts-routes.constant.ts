import { APP_ROUTES } from './routes.constant';

export const PUBLISH_POSTS_QUERY_KEYS = {
  PUBLICATION_STATE: 'publicationState',
  STATUS: 'status',
} as const;

export const PUBLISH_POSTS_PUBLICATION_STATES = [
  'not-posted',
  'posted',
] as const;

export type PublishPostsPublicationState =
  (typeof PUBLISH_POSTS_PUBLICATION_STATES)[number];

export interface PublishPostsFilterRouteOptions {
  publicationState?: PublishPostsPublicationState;
  status?: string;
}

/** Build a canonical Posts library deep link with lifecycle filters. */
export function createPublishPostsFilterRoute({
  publicationState,
  status,
}: PublishPostsFilterRouteOptions = {}): string {
  const params: string[] = [];

  if (publicationState) {
    params.push(
      `${PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE}=${encodeURIComponent(publicationState)}`,
    );
  }

  if (status) {
    params.push(
      `${PUBLISH_POSTS_QUERY_KEYS.STATUS}=${encodeURIComponent(status)}`,
    );
  }

  const queryString = params.join('&');
  return queryString
    ? `${APP_ROUTES.PUBLISH.POSTS}?${queryString}`
    : APP_ROUTES.PUBLISH.POSTS;
}
