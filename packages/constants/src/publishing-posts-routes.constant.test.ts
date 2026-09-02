import { PostStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  createPublishingPostsFilterRoute,
  PUBLISHING_POSTS_QUERY_KEYS,
  parsePublishingPostsViewMode,
} from './publishing-posts-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('publishing-posts-routes.constant', () => {
  it('returns the canonical library when no filters are provided', () => {
    expect(createPublishingPostsFilterRoute()).toBe(
      APP_ROUTES.PUBLISHING.POSTS,
    );
  });

  it('builds exact status filter deep links', () => {
    expect(createPublishingPostsFilterRoute({ status: PostStatus.DRAFT })).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?${PUBLISHING_POSTS_QUERY_KEYS.STATUS}=${PostStatus.DRAFT}`,
    );
  });

  it.each(['not-posted', 'posted'] as const)(
    'builds the %s publication facet deep link',
    (publicationState) => {
      expect(createPublishingPostsFilterRoute({ publicationState })).toBe(
        `${APP_ROUTES.PUBLISHING.POSTS}?${PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE}=${publicationState}`,
      );
    },
  );

  it('builds deterministic encoded links when filters are combined', () => {
    expect(
      createPublishingPostsFilterRoute({
        publicationState: 'not-posted',
        status: 'needs review',
      }),
    ).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?${PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE}=not-posted&${PUBLISHING_POSTS_QUERY_KEYS.STATUS}=needs%20review`,
    );
  });
});

describe('parsePublishingPostsViewMode', () => {
  it.each(['list', 'board', 'grid'] as const)('accepts the %s view', (view) => {
    expect(parsePublishingPostsViewMode(view)).toBe(view);
  });

  it('falls back to list for a missing value', () => {
    expect(parsePublishingPostsViewMode(undefined)).toBe('list');
    expect(parsePublishingPostsViewMode(null)).toBe('list');
  });

  it('falls back to list for an unknown value', () => {
    expect(parsePublishingPostsViewMode('kanban')).toBe('list');
    expect(parsePublishingPostsViewMode('canvas')).toBe('list');
    expect(parsePublishingPostsViewMode('')).toBe('list');
  });
});
