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
  const params = new URLSearchParams();

  if (publicationState) {
    params.set(PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE, publicationState);
  }

  if (status) {
    params.set(PUBLISH_POSTS_QUERY_KEYS.STATUS, status);
  }

  const queryString = params.toString();
  return queryString
    ? `${APP_ROUTES.PUBLISH.POSTS}?${queryString}`
    : APP_ROUTES.PUBLISH.POSTS;
}
