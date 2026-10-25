import { describe, expect, it } from 'vitest';
import { PostStatus } from '..';

import {
  createPublishingApprovalsRoute,
  createPublishingPostsFilterRoute,
  PUBLISHING_POSTS_QUERY_KEYS,
  parsePublishingApprovalsPath,
  parsePublishingPostsViewMode,
} from './publishing-posts-routes.constant';
import { APP_ROUTES } from './routes.constant';

describe('publishing-posts-routes.constant', () => {
  it('opens the approvals queue at its own path (#5502)', () => {
    expect(createPublishingApprovalsRoute()).toBe('/publishing/approvals');
    expect(APP_ROUTES.PUBLISHING.APPROVALS).toBe('/publishing/approvals');
  });

  it('puts the Turbo run and item in the path and keeps the filter a param', () => {
    expect(
      createPublishingApprovalsRoute({
        filter: 'ready',
        item: 'item-2',
        run: 'run-1',
      }),
    ).toBe('/publishing/approvals/run-1/item-2?filter=ready');
    expect(createPublishingApprovalsRoute({ run: 'run-1' })).toBe(
      '/publishing/approvals/run-1',
    );
    expect(
      createPublishingApprovalsRoute({
        filter: undefined,
        item: '',
        run: null,
      }),
    ).toBe('/publishing/approvals');
  });

  it('rides an item without a run as a query param', () => {
    expect(createPublishingApprovalsRoute({ item: 'item-2' })).toBe(
      '/publishing/approvals?item=item-2',
    );
  });

  it('focuses one review inbox gate (#7340)', () => {
    expect(
      createPublishingApprovalsRoute({ approval: 'mcp_approval:apr-1' }),
    ).toBe('/publishing/approvals?approval=mcp_approval%3Aapr-1');
  });

  it('reads the run and item back from a scoped pathname', () => {
    expect(
      parsePublishingApprovalsPath(
        '/acme/brand/publishing/approvals/r%201/i-2',
      ),
    ).toEqual({
      basePath: '/acme/brand/publishing/approvals',
      item: 'i-2',
      run: 'r 1',
    });
    expect(
      parsePublishingApprovalsPath('/acme/brand/publishing/approvals'),
    ).toEqual({
      basePath: '/acme/brand/publishing/approvals',
      item: null,
      run: null,
    });
    expect(
      parsePublishingApprovalsPath('/acme/brand/publishing/posts'),
    ).toEqual({
      basePath: '/acme/brand/publishing/posts',
      item: null,
      run: null,
    });
  });

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

  it('builds the release drawer deep link', () => {
    expect(createPublishingPostsFilterRoute({ release: 'release-1' })).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?${PUBLISHING_POSTS_QUERY_KEYS.RELEASE}=release-1`,
    );
  });

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
