import {
  PageScope,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  buildReleasePostsListQueryKey,
  normalizeReleasePostContentTypes,
  normalizeReleasePostsSort,
} from './release-posts-list-query';

describe('release-posts-list-query', () => {
  it('keys every canonical filter and stable page input', () => {
    expect(
      buildReleasePostsListQueryKey({
        brandId: 'brand-1',
        contentTypes: [PostCategory.TEXT, PostCategory.VIDEO],
        credentialIds: ['credential-2', 'credential-1'],
        currentPage: 3,
        executionStates: [TargetExecutionState.FAILED],
        organizationId: 'org-1',
        platform: 'instagram',
        publicationState: 'posted',
        scope: PageScope.PUBLISHING,
        search: 'launch',
        sort: 'scheduledDate: 1',
      }),
    ).toEqual([
      'publish-release-list',
      PageScope.PUBLISHING,
      'org-1',
      'brand-1',
      `${PostCategory.TEXT},${PostCategory.VIDEO}`,
      'posted',
      TargetExecutionState.FAILED,
      'instagram',
      'launch',
      'scheduledDate: 1',
      3,
      'credential-2,credential-1',
    ]);
  });

  it('keeps valid unique content types from legacy deep links', () => {
    expect(
      normalizeReleasePostContentTypes([
        PostCategory.TEXT,
        'invalid',
        PostCategory.TEXT,
        PostCategory.VIDEO,
      ]),
    ).toEqual([PostCategory.TEXT, PostCategory.VIDEO]);
    expect(normalizeReleasePostContentTypes('invalid')).toBeUndefined();
  });

  it('falls back to the canonical deterministic sort', () => {
    expect(normalizeReleasePostsSort('status: -1')).toBe('createdAt: -1');
    expect(normalizeReleasePostsSort('updatedAt: 1')).toBe('createdAt: -1');
    expect(normalizeReleasePostsSort('scheduledDate: 1')).toBe(
      'scheduledDate: 1',
    );
  });
});
