import { PostStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  createPublishPostsFilterRoute,
  PUBLISH_POSTS_QUERY_KEYS,
} from './publish-posts-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('publish-posts-routes.constant', () => {
  it('returns the canonical library when no filters are provided', () => {
    expect(createPublishPostsFilterRoute()).toBe(APP_ROUTES.PUBLISH.POSTS);
  });

  it('builds exact status filter deep links', () => {
    expect(createPublishPostsFilterRoute({ status: PostStatus.DRAFT })).toBe(
      `${APP_ROUTES.PUBLISH.POSTS}?${PUBLISH_POSTS_QUERY_KEYS.STATUS}=${PostStatus.DRAFT}`,
    );
  });

  it.each(['not-posted', 'posted'] as const)(
    'builds the %s publication facet deep link',
    (publicationState) => {
      expect(createPublishPostsFilterRoute({ publicationState })).toBe(
        `${APP_ROUTES.PUBLISH.POSTS}?${PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE}=${publicationState}`,
      );
    },
  );

  it('builds deterministic encoded links when filters are combined', () => {
    expect(
      createPublishPostsFilterRoute({
        publicationState: 'not-posted',
        status: 'needs review',
      }),
    ).toBe(
      `${APP_ROUTES.PUBLISH.POSTS}?${PUBLISH_POSTS_QUERY_KEYS.PUBLICATION_STATE}=not-posted&${PUBLISH_POSTS_QUERY_KEYS.STATUS}=needs%20review`,
    );
  });
});
