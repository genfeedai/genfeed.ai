import {
  CredentialPlatform,
  PageScope,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildCapturedPostsListQueryKey,
  buildCapturedPostsQuery,
  CAPTURED_POSTS_SORT_OPTIONS,
  normalizeCapturedPostsSort,
} from './captured-posts-list-query';

const base = {
  limit: 12,
  organizationId: 'org-1',
  page: 2,
  search: '',
  sort: 'createdAt: -1' as const,
};

describe('buildCapturedPostsQuery', () => {
  it('always asks for lowercase source extension, scoped to the organization', () => {
    expect(buildCapturedPostsQuery(base)).toEqual({
      limit: 12,
      organizationId: 'org-1',
      page: 2,
      sort: 'createdAt: -1',
      source: 'extension',
    });
  });

  it('carries brand, campaign, platform and search into the posts query', () => {
    expect(
      buildCapturedPostsQuery({
        ...base,
        brandId: 'brand-1',
        campaignId: 'campaign-1',
        platform: CredentialPlatform.TWITTER,
        search: 'launch',
      }),
    ).toMatchObject({
      brandId: 'brand-1',
      campaignId: 'campaign-1',
      platform: CredentialPlatform.TWITTER,
      search: 'launch',
      source: 'extension',
    });
  });

  it('never sorts by a scheduled date captured posts do not have', () => {
    expect(
      buildCapturedPostsQuery({ ...base, sort: 'scheduledDate: 1' })?.sort,
    ).toBe('createdAt: -1');
    expect(normalizeCapturedPostsSort('createdAt: 1')).toBe('createdAt: 1');
    expect(CAPTURED_POSTS_SORT_OPTIONS.map(({ value }) => value)).toEqual([
      'createdAt: -1',
      'createdAt: 1',
    ]);
  });

  it('adds no constraint for a lifecycle filter that includes published', () => {
    expect(
      buildCapturedPostsQuery({ ...base, publicationState: 'posted' }),
    ).not.toBeNull();
    expect(
      buildCapturedPostsQuery({
        ...base,
        executionStates: [
          TargetExecutionState.FAILED,
          TargetExecutionState.PUBLISHED,
        ],
      }),
    ).not.toBeNull();
  });

  it.each([
    ['not posted', { publicationState: 'not-posted' as const }],
    [
      'a non-published execution state',
      { executionStates: [TargetExecutionState.SCHEDULED] },
    ],
    ['media-only content types', { contentTypes: [PostCategory.VIDEO] }],
  ])(
    'returns null for %s because nothing captured can match',
    (_name, filters) => {
      expect(buildCapturedPostsQuery({ ...base, ...filters })).toBeNull();
    },
  );

  it('keeps text content in scope', () => {
    expect(
      buildCapturedPostsQuery({
        ...base,
        contentTypes: [PostCategory.TEXT, PostCategory.VIDEO],
      }),
    ).not.toBeNull();
  });
});

describe('buildCapturedPostsListQueryKey', () => {
  const key = {
    brandId: 'brand-1',
    currentPage: 1,
    organizationId: 'org-1',
    scope: PageScope.PUBLISHING,
    search: '',
    sort: 'createdAt: -1' as const,
  };

  it('is source-qualified and distinct per organization, brand, page and search', () => {
    const baseKey = buildCapturedPostsListQueryKey(key);
    expect(baseKey).toContain('extension');
    for (const changed of [
      { organizationId: 'org-2' },
      { brandId: 'brand-2' },
      { currentPage: 2 },
      { search: 'x' },
      { platform: 'twitter' },
    ]) {
      expect(
        buildCapturedPostsListQueryKey({ ...key, ...changed }),
      ).not.toEqual(baseKey);
    }
  });

  it('shares a key between sorts that normalize to the same ordering', () => {
    expect(
      buildCapturedPostsListQueryKey({ ...key, sort: 'scheduledDate: 1' }),
    ).toEqual(buildCapturedPostsListQueryKey(key));
  });
});
