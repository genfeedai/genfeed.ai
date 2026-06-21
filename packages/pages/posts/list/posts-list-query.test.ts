import { PageScope, PostStatus } from '@genfeedai/enums';
import {
  buildPostsListQueryKey,
  getDefaultPostsSort,
} from '@pages/posts/list/posts-list-query';
import { describe, expect, it } from 'vitest';

describe('posts list query helpers', () => {
  it('builds the shared posts list query key used by server hydration and client queries', () => {
    expect(
      buildPostsListQueryKey({
        adminBrand: '',
        adminOrg: '',
        brandId: 'brand_123',
        currentPage: 2,
        filterSearch: 'launch',
        filterSort: 'scheduledDate: 1',
        filterStatus: PostStatus.SCHEDULED,
        organizationId: 'org_123',
        platformFilter: 'linkedin',
        scope: PageScope.PUBLISHER,
        status: PostStatus.SCHEDULED,
      }),
    ).toEqual([
      'posts-list',
      PageScope.PUBLISHER,
      'brand_123',
      'org_123',
      'linkedin',
      'launch',
      PostStatus.SCHEDULED,
      'scheduledDate: 1',
      2,
      PostStatus.SCHEDULED,
      '',
      '',
    ]);
  });

  it('keeps the server and client default sort rules aligned', () => {
    expect(getDefaultPostsSort(PostStatus.SCHEDULED)).toBe('scheduledDate: 1');
    expect(getDefaultPostsSort(PostStatus.PUBLIC)).toBe('scheduledDate: -1');
    expect(getDefaultPostsSort()).toBe('createdAt: -1');
  });
});
